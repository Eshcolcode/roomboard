// Simple mode walk-through + screenshots: node qa/flow.mjs  (needs a preview on :4173 or QA_URL).
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
  await p.evaluate(() => { localStorage.clear(); for (const id of ['u-eshcol', 'u-client', 'u-housekeeper']) localStorage.setItem('rb-welcome:' + id, '1'); });
  await p.reload();
  await p.waitForTimeout(400);
  return p;
}
const shot = (p, n, full = false) => p.screenshot({ path: OUT + 'flow-' + n + '.png', fullPage: full });
const stays = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays);
const settle = p => p.waitForTimeout(450);

// ---- RJ McLeod: home and a single booking ----
let p = await pg();
await p.selectOption('select.s-who', 'u-client'); await settle(p);
ok(!/mockup/i.test(await p.locator('.s-top').innerText()), 'no Mockup wording in the header');
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
{
  const t = await p.locator('body').innerText();
  ok(!/£|indicative|estimate/i.test(t) && t.includes('Included in your contract'), 'Room held (contract room): no price, "Included in your contract"');
}
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
ok(await p.locator('[data-fix="move"] button').isVisible(), 'nearest free room offered (move whole stay)');
ok((await p.locator('.s-fix').first().getAttribute('data-fix')) === 'split', 'keep-room split offered first');
await shot(p, 'change-clash');
const before = (await stays(p)).find(s => s.id === pair[0].id);
await p.click('[data-fix="move"] button'); await settle(p);
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

// ---- Eshcol: crew of 12 ----
p = await pg();
await p.click('text=Book a room'); await settle(p);
await p.click('.s-pick:has-text("A crew")'); await settle(p);
await shot(p, 'crew-1-count');
await p.click('button:has-text("Next")'); await settle(p);
// pick the first arrival (3 to 9 weeks out) where 12 contract rooms are free for 10 nights in the demo data,
// so the check does not depend on where today's date falls against the seeded stays
const day = await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('roomboard-demo-v2'));
  const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const add = (d, n) => new Date(Date.parse(d + 'T00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const rooms = x.rooms.filter(r => r.propertyId === 'p-es' || r.propertyId === 'p-lr');
  for (let i = 21; i < 63; i++) {
    const a = add(T, i), d = add(a, 10);
    const free = rooms.filter(r => !x.stays.some(s => s.roomId === r.id && s.arrival < d && (!s.departure || s.depStatus === 'ufn' || s.departure > a)));
    if (free.length >= 12) return a;
  }
  return null;
});
ok(!!day, 'demo data has a 10-night window with 12 free rooms (' + day + ')');
const dayLabel = new Date(day + 'T00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
for (let i = 0; i < 4 && !(await p.locator(`.s-calgrid [aria-label="${dayLabel}"]`).count()); i++) {
  await p.click('[aria-label="Next month"]'); await settle(p);
}
await p.locator(`.s-calgrid [aria-label="${dayLabel}"]`).click(); await p.waitForTimeout(700);
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
await p.click('text=What needs cleaning'); await settle(p); await shot(p, 'cleaning-rj');
const txt = await p.locator('.s-box').innerText();
ok(!/Housekeeper/i.test(txt), 'RJ McLeod never sees cleaner names on the cleaning list');
p = await pg(1280, 900); await shot(p, 'home-desktop');
await p.goto(U + '#board'); await settle(p);
ok(await p.locator('.top').isVisible(), 'full app still opens from simple mode (#board)');

// ---- regression (18 Oct 2026): set a leaving date on an open-ended stay in Simple mode ----
{
  const all2 = await stays(p);
  const o = all2.find(s => s.depStatus === 'ufn' && !s.departure && /^(es|lr)-/.test(s.roomId));
  await p.goto(U + '#simple/stay/' + o.id); await settle(p);
  ok(await p.locator('.s-act:has-text("Set leaving date")').isVisible(), 'open-ended stay: "Set leaving date" instead of "Staying longer"');
  await p.click('.s-act:has-text("Change dates")'); await settle(p);
  await p.click('button:has-text("Set a leaving date")'); await settle(p);
  await p.click('.s-btn.big:has-text("Save")'); await p.waitForTimeout(800);
  const o1 = (await stays(p)).find(s => s.id === o.id);
  ok(!!o1.departure && o1.depStatus === 'planned' && o1.departure > T, 'open-ended stay: leaving date saved, not in the past (' + o1.departure + ')');
  await p.goto(U + '#simple/stay/' + o.id); await p.reload(); await settle(p);
  const nice = new Date(o1.departure + 'T12:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const txt = await p.locator('body').innerText();
  ok(txt.includes(nice) && !txt.includes('To follow'), 'the card shows the new leaving date (' + nice + ')');
}

// ---- extra property (Harris), phone: same guest details as a contract room, RJ McLeod ----
{
  const p = await pg();
  await p.selectOption('select.s-who', 'u-client'); await settle(p);
  await p.goto(U + '#available/p-pod1'); await settle(p);
  if (await p.locator('select.who').count()) { await p.selectOption('select.who', 'u-client'); await settle(p); }
  const free = p.locator('[data-unit="x-pod1"] .av-d.s-free:not([disabled])');
  await free.nth(3).click(); await free.nth(6).click(); await settle(p);
  await p.locator('[data-unit="x-pod1"] .av-go').click(); await settle(p);
  const q = p.locator('.q-panel');
  ok(await q.locator('input[aria-label="Name"]').isVisible() && !(await q.locator('.s-pick.crew').count()), 'extra (phone): booking asks who, as for a contract room (no crew)');
  await q.locator('.s-pick.tbc').click(); await settle(p);
  const st = (await stays(p)).find(s => s.roomId === 'x-pod1' && s.bookedBy === 'u-client');
  ok(!!st && !st.workerId, 'extra (phone): booked with the name to follow');
  await q.locator('.s-btn:has-text("Done")').click(); await settle(p);
  // the Simple booking card: name from the list, phone and notes
  await p.goto(U + '#simple/stay/' + st.id); await p.reload(); await settle(p);
  const t0 = await p.locator('body').innerText();
  ok(t0.includes('Add the name') && /Add phone or notes/.test(t0) && t0.includes('whole property') && /Indicative £\d+/.test(t0) && !t0.includes('Move room'), 'extra card (Simple): name, phone/notes, price, whole-property badge; no Move room');
  await shot(p, 'extra-card');
  await p.click('.s-act:has-text("Add the name")'); await settle(p);
  await p.fill('input[aria-label="Name"]', 'Iain');
  await p.click('.s-pick:has-text("Iain Smith")'); await settle(p);
  await p.click('[data-act="details"]'); await settle(p);
  await p.fill('input[aria-label="Phone number"]', '07700 900666');
  await p.fill('textarea[aria-label="Notes"]', 'Needs ground floor');
  await p.click('button[type=submit]:has-text("Save")'); await settle(p);
  const x = await p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
  const iain = x.workers.find(w => w.name === 'Iain Smith');
  const s2 = x.stays.find(s => s.id === st.id);
  ok(s2.workerId === iain.id && iain.phone === '07700 900666' && s2.notes === 'Needs ground floor', 'extra card (Simple): name picked from the list, phone and notes saved');
  await shot(p, 'extra-card-named');
  // Eshcol's own guest: dates only for RJ McLeod, no edit, no name
  const dg = x.stays.find(s => s.roomId === 'x-cottage' && s.bookedBy === 'u-eshcol');
  await p.goto(U + '#simple/stay/' + dg.id); await p.reload(); await settle(p);
  const t1 = await p.locator('body').innerText();
  ok(!t1.includes('Direct guest') && !t1.includes('Swap person') && t1.includes('ask Eshcol'), "Eshcol's own extra guest stays dates-only to RJ McLeod");
  await p.close();
}

ok(!errs.length, 'no console/page errors ' + errs.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
