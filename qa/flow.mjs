// Simple mode (mockup) walk-through + screenshots: node qa/flow.mjs  (needs a preview on :4173 or QA_URL).
import { chromium } from 'playwright';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = new URL('../screens/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const errs = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
async function pg(w = 390, h = 844) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#simple');
  await p.evaluate(() => { localStorage.clear(); for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1'); });
  await p.reload();
  await p.waitForTimeout(400);
  return p;
}
const shot = (p, n, full = false) => p.screenshot({ path: OUT + 'flow-' + n + '.png', fullPage: full });
const stays = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays);
const settle = p => p.waitForTimeout(450);

// ---- Sheena: home and a single booking ----
let p = await pg();
await p.selectOption('select.s-who', 'u-client'); await settle(p);
ok(await p.locator('.s-mock').isVisible(), 'Mockup label shown');
ok((await p.locator('.s-huge').count()) === 3, 'home has three huge buttons');
await shot(p, 'home'); await shot(p, 'home-full', true);
const n0 = (await stays(p)).length;
await p.click('text=Book a room'); await settle(p);
await shot(p, 'book-1-who');
await p.fill('.s-input', 'Hamish Test'); await settle(p);
await shot(p, 'book-1-who-typed');
await p.click('button:has-text("Use “Hamish Test”")'); await settle(p);
ok(await p.locator('h2:has-text("When are they arriving")').isVisible(), 'step 2 arriving');
await shot(p, 'book-2-arrive');
await p.click('.s-chip:has-text("Monday")'); await p.waitForTimeout(700);
ok(await p.locator('h2:has-text("When are they leaving")').isVisible(), 'step 3 leaving (auto-advance)');
await shot(p, 'book-3-leave');
await p.click('.s-chip:has-text("7 nights")'); await p.waitForTimeout(700);
ok(await p.locator('h2:has-text("Which room")').isVisible(), 'step 4 room');
await shot(p, 'book-4-room');
await p.locator('.s-room').first().click(); await settle(p);
ok(await p.locator('h2:has-text("Room held!")').isVisible(), 'Room held! confirmation');
ok((await stays(p)).length === n0 + 1, 'hold really saved in demo data');
await shot(p, 'room-held');
await p.click('.s-extra:has-text("Phone number")'); await settle(p);
await p.fill('.s-input', '07700 900123'); await shot(p, 'extra-phone');
await p.click('button:has-text("Save")'); await settle(p);
ok(await p.locator('.s-extra.done:has-text("Phone number")').isVisible(), 'phone extra saved, back on held screen');
await p.click('.s-extra:has-text("Repeat as a rota")'); await settle(p);
await shot(p, 'extra-rota');
await p.click('.s-chip:has-text("10 on · 4 off")'); await settle(p);
await p.click('.s-chip:has-text("8 weeks")'); await settle(p);
await p.click('.s-pick:has-text("Keep the room")'); await p.waitForTimeout(600);
const rota = (await stays(p)).filter(s => s.workerId && s.seriesId);
ok(rota.length >= 4, 'rota saved as repeating stays (' + rota.length + ')');
await shot(p, 'room-held-rota');

// ---- change flow with clash ----
const all = await stays(p);
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const pair = all
  .filter(s => s.departure && s.departure > T && !s.seriesId)
  .map(s => [s, all.filter(n => n.roomId === s.roomId && n.id !== s.id && n.arrival >= s.departure).sort((a, c) => a.arrival.localeCompare(c.arrival))[0]])
  .find(([s, n]) => n && n.workerId !== s.workerId);
await p.goto(U + '#simple/stay/' + pair[0].id); await p.reload(); await settle(p);
ok(await p.locator('.s-act:has-text("Leaving early")').isVisible(), 'change card with big buttons');
await shot(p, 'change-card');
await p.click('.s-act:has-text("Staying longer")'); await settle(p);
await shot(p, 'change-longer');
for (let i = 0; i < 40 && !(await p.locator('.s-note.bad').count()); i++) await p.click('[aria-label="Leaving: one day later"]');
ok(await p.locator('.s-note.bad:has-text("already booked")').isVisible(), 'clash explained in plain words before saving');
ok(await p.locator('button:has-text("and save")').isVisible(), 'nearest free room offered');
await shot(p, 'change-clash');
const before = (await stays(p)).find(s => s.id === pair[0].id);
await p.click('button:has-text("and save")'); await settle(p);
const after = (await stays(p)).find(s => s.id === pair[0].id);
ok(after.roomId !== before.roomId && after.departure > before.departure, 'saved: longer stay, moved to free room');
ok(await p.locator('.s-toast button:has-text("Undo")').isVisible(), 'Undo toast shown');
await shot(p, 'change-saved-undo');
await p.click('.s-toast button:has-text("Undo")'); await settle(p);
const undone = (await stays(p)).find(s => s.id === pair[0].id);
ok(undone.roomId === before.roomId && undone.departure === before.departure, 'Undo puts it back');
await p.click('.s-act:has-text("Change dates")'); await settle(p); await shot(p, 'change-dates');
await p.click('[aria-label="Back"]'); await settle(p);
await p.click('.s-act:has-text("Move room")'); await settle(p); await shot(p, 'change-move');
await p.click('[aria-label="Back"]'); await settle(p);
await p.click('.s-act:has-text("Cancel")'); await settle(p); await shot(p, 'change-cancel');

// ---- Donald: crew of 12 ----
p = await pg();
await p.click('text=Book a room'); await settle(p);
await p.click('.s-pick:has-text("A crew")'); await settle(p);
await shot(p, 'crew-1-count');
await p.click('button:has-text("Next")'); await settle(p);
const day = new Date(Date.now() + 21 * 864e5);
await p.click('[aria-label="Next month"]'); await settle(p);
await p.locator('.s-calgrid .d:not([disabled])').nth(10).click(); await p.waitForTimeout(700);
await p.click('.s-chip:has-text("10 nights")'); await p.waitForTimeout(700);
await shot(p, 'crew-2-rooms');
const c0 = (await stays(p)).length;
await p.click('button:has-text("Hold these")'); await settle(p);
const c1 = await stays(p);
ok(c1.length - c0 === 12, 'crew of 12 held in one go');
await shot(p, 'crew-held');
await p.click('button:has-text("Open booking")'); await settle(p);
ok(await p.locator('button:has-text("Change whole crew (12 people)")').isVisible(), 'change whole crew option');
await p.click('button:has-text("Change whole crew")'); await settle(p);
await shot(p, 'crew-change');
await p.click('.s-act:has-text("Shift all dates")'); await settle(p);
await p.click('[aria-label="One day later"]'); await settle(p);
await shot(p, 'crew-shift');
const crewIds = c1.slice(c0).map(s => s.id);
const a0 = c1.find(s => s.id === crewIds[0]).arrival;
await p.click('button:has-text("Save")'); await settle(p);
const moved = (await stays(p)).filter(s => crewIds.includes(s.id));
ok(moved.length === 12 && moved.every(s => s.arrival > a0), 'whole crew shifted 2 days later');
await p.click('.s-toast button:has-text("Undo")'); await p.waitForTimeout(800);
ok((await stays(p)).filter(s => crewIds.includes(s.id)).every(s => s.arrival === a0), 'Undo reverts the whole crew shift');
void day;

// ---- lists ----
p = await pg();
await p.click('text=Who’s arriving today'); await settle(p); await shot(p, 'arrivals');
await p.goto(U + '#simple'); await settle(p);
await p.selectOption('select.s-who', 'u-client'); await settle(p);
await p.click('text=What needs cleaning'); await settle(p); await shot(p, 'cleaning-sheena');
const txt = await p.locator('.s-box').innerText();
ok(!/Mairi/i.test(txt), 'Sheena never sees cleaner names on the cleaning list');
p = await pg(1280, 900); await shot(p, 'home-desktop');
await p.goto(U + '#board'); await settle(p);
ok(await p.locator('.top').isVisible(), 'full app still opens from simple mode (#board)');

ok(!errs.length, 'no console/page errors ' + errs.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
