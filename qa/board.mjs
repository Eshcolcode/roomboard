// Quick mode inside the full app (board, room cards, lists) + the Quick/Classic switch.
// node qa/board.mjs  (preview on :4173 or QA_URL). Screens go to SHOTS (default /workspace/flow-shots).
import { chromium } from 'playwright';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = (process.env.SHOTS ?? '/workspace/flow-shots') + '/';
const b = await chromium.launch({ executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const errs = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const D = n => new Date(Date.parse(T + 'T00:00Z') + n * 864e5).toISOString().slice(0, 10);
async function pg(w, h, hash = 'board', mode = null) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#' + hash);
  await p.evaluate(m => { localStorage.clear(); for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1'); if (m) localStorage.setItem('rb-ui-mode', m); }, mode);
  await p.reload();
  await p.waitForTimeout(450);
  return p;
}
const shot = (p, n) => p.screenshot({ path: OUT + 'board-' + n + '.png' });
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
const settle = p => p.waitForTimeout(450);

// ---------- desktop: board -> quick side panel ----------
let p = await pg(1440, 950);
ok((await p.locator('.q-switch [aria-checked="true"]').innerText()) === 'Quick', 'Quick is the default (desktop switch)');
await p.locator('.row[data-room="lr-6"] .bar').first().click(); await settle(p);
ok(await p.locator('.q-panel.side').isVisible(), 'desktop: tapping a booking opens the quick side panel');
ok((await p.locator('.q-panel .s-act').count()) === 6, 'quick card has the six big buttons');
ok(await p.locator('.row[data-room="lr-1"]').isVisible(), 'board still visible beside the panel');
ok((await p.locator('.panel').count()) === 0, 'classic panel not opened');
await shot(p, 'desktop-quick-card');
// tapping another booking switches the card
await p.locator('.row[data-room="lr-1"] .bar').first().click(); await settle(p);
ok(/Room 1/.test(await p.locator('.q-panel').innerText()), 'tapping another booking switches the card');
// All details -> classic panel
await p.click('.q-panel .s-link:has-text("All details")'); await settle(p);
ok(await p.locator('.panel').isVisible() && !(await p.locator('.q-panel').count()), '"All details" opens the classic panel');
await p.keyboard.press('Escape'); await settle(p);

// ---------- desktop: empty cell -> prefilled booking ----------
{
  const x = await db(p);
  const W = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.track')).backgroundSize));
  const tl = await p.evaluate(() => parseFloat(document.querySelector('.todayline').style.left));
  const todayIdx = Math.round((tl - W / 2) / W);
  let pick = null;
  for (const k of [4, 5, 6, 7, 8, 9, 10, 3, 2])
    for (const r of x.rooms.filter(r => /^(lr|es)-/.test(r.id))) {
      const busy = x.stays.some(s => s.roomId === r.id && s.arrival < D(k + 4) && (s.departure ?? '9') > D(k - 1));
      if (!busy && !pick) pick = { room: r, k };
    }
  await p.locator(`.row[data-room="${pick.room.id}"]`).scrollIntoViewIfNeeded();
  const track = await p.locator(`.row[data-room="${pick.room.id}"] .track`).boundingBox();
  await p.mouse.click(track.x + (todayIdx + pick.k) * W + W / 2, track.y + track.height / 2); await settle(p);
  ok(await p.locator('.q-panel h2:has-text("Who is staying")').isVisible(), 'desktop: empty cell starts the quick booking');
  const sub = await p.locator('.q-panel .s-sub').innerText();
  ok(sub.includes(pick.room.name), 'prefilled with that room (' + sub.replace(/\n/g, ' ') + ')');
  await shot(p, 'desktop-empty-cell-booking');
  await p.click('.q-panel .s-pick.tbc'); await settle(p);
  ok(await p.locator('.q-panel h2:has-text("When are they leaving")').isVisible(), 'arrival step skipped (date from the cell)');
  await shot(p, 'desktop-empty-cell-leaving');
  await p.click('.q-panel .s-chip:has-text("3 nights")'); await p.waitForTimeout(800);
  ok(await p.locator('.q-panel h2:has-text("Room held")').isVisible(), 'room step skipped: held straight away');
  const held = (await db(p)).stays.find(s => s.roomId === pick.room.id && s.arrival === D(pick.k));
  ok(held && held.departure === D(pick.k + 3), 'hold saved in the tapped room on the tapped day');
  await shot(p, 'desktop-empty-cell-held');
  await p.keyboard.press('Escape'); await settle(p);
}

// ---------- desktop: drag still works in Quick mode ----------
{
  const a0 = (await db(p)).stays.find(s => s.roomId === 'lr-6').arrival;
  const bb = await p.locator('.row[data-room="lr-6"] .bar').first().boundingBox();
  const W = 56;
  await p.mouse.move(bb.x + 40, bb.y + bb.height / 2); await p.mouse.down();
  await p.mouse.move(bb.x + 40 + W, bb.y + bb.height / 2, { steps: 4 });
  await p.mouse.move(bb.x + 40 + 2 * W, bb.y + bb.height / 2, { steps: 4 });
  await p.mouse.up(); await p.waitForTimeout(200);
  ok(/Move/.test(await p.locator('.dialog').innerText()) && !(await p.locator('.q-panel').count()), 'drag-to-move still works and does not open the quick card');
  await p.click('.dialog button:has-text("Go back")'); await settle(p);
  ok((await db(p)).stays.find(s => s.roomId === 'lr-6').arrival === a0, 'Go back leaves the stay unchanged');
}

// ---------- the switch: Classic = the old panel, remembered ----------
await shot(p, 'desktop-toggle-quick');
await p.click('.q-switch button:has-text("Classic")'); await settle(p);
ok((await p.evaluate(() => localStorage.getItem('rb-ui-mode'))) === 'classic', 'switch remembered in localStorage');
await p.locator('.row[data-room="lr-6"] .bar').first().click(); await settle(p);
ok(await p.locator('.panel').isVisible() && !(await p.locator('.q-panel').count()), 'Classic: tapping a booking opens the classic panel');
await p.keyboard.press('Escape'); await settle(p);
await p.reload(); await settle(p);
ok((await p.locator('.q-switch [aria-checked="true"]').innerText()) === 'Classic', 'Classic still selected after reload');
await p.locator('.row[data-room="lr-6"] .bar').first().click(); await settle(p);
ok(await p.locator('.panel').isVisible(), 'Classic after reload: classic panel');
await p.keyboard.press('Escape'); await settle(p);
await shot(p, 'desktop-toggle-classic');
await p.click('.demo-pill'); await settle(p);
await shot(p, 'desktop-toggle-demo-popover');
await p.click('.q-pop button:has-text("Quick")'); await settle(p);
ok((await p.evaluate(() => localStorage.getItem('rb-ui-mode'))) === 'quick', 'switch in the Demo popover works too');

// ---------- desktop: split stay ----------
async function splitCase(p, phone) {
  const x = await db(p);
  const pair = x.stays
    .filter(s => s.departure && s.departure > T && s.arrival <= D(3) && !s.seriesId && s.workerId)
    .map(s => [s, x.stays.filter(n => n.roomId === s.roomId && n.id !== s.id && n.arrival >= s.departure).sort((a, c) => a.arrival.localeCompare(c.arrival))[0]])
    .find(([s, n]) => n && n.workerId !== s.workerId);
  const [s, n] = pair;
  if (phone) await p.evaluate(id => (location.hash = 'rooms'), s.id);
  await p.evaluate(id => (location.hash = 'simple/stay/' + id), s.id); // not used: open via the board instead
  await p.goto(U + '#' + (phone ? 'rooms' : 'board')); await settle(p);
  if (phone) await p.locator(`.rcard[data-room="${s.roomId}"] .qup`).click();
  else await p.locator(`.row[data-room="${s.roomId}"] .bar`).first().click();
  await settle(p);
  const card = await p.locator('.q-panel').innerText();
  if (!card.includes('Staying longer')) return ok(false, 'split: opened the stay');
  await p.click('.q-panel .s-act:has-text("Staying longer")'); await settle(p);
  for (let i = 0; i < 40 && !(await p.locator('.q-panel .s-note.bad').count()); i++) await p.click('.q-panel [aria-label="Leaving: one day later"]');
  for (let i = 0; i < 2; i++) await p.click('.q-panel [aria-label="Leaving: one day later"]');
  await settle(p);
  const btn = p.locator('.q-panel button:has-text("extra nights in")');
  ok(await btn.isVisible(), (phone ? 'phone' : 'desktop') + ': split-stay offered (keep room, extra nights elsewhere)');
  const order = await p.locator('.q-panel .s-box button.s-btn').allInnerTexts();
  ok(/extra nights in/.test(order[0]), 'split-stay is the first option, whole-stay move second (' + order.join(' | ').replace(/\n/g, ' ') + ')');
  await btn.scrollIntoViewIfNeeded();
  await shot(p, (phone ? 'phone' : 'desktop') + '-split-stay');
  const before = (await db(p)).stays.length;
  await btn.click(); await settle(p);
  const y = await db(p);
  const kept = y.stays.find(z => z.id === s.id);
  const extra = y.stays.find(z => z.workerId === s.workerId && z.arrival === kept.departure && z.roomId !== s.roomId);
  ok(y.stays.length === before + 1 && kept.roomId === s.roomId && kept.departure === n.arrival && !!extra, 'split saved: same room up to the next booking, then the new room');
  ok(await p.locator('.s-toast button:has-text("Undo")').isVisible(), 'Undo offered after the split');
  await shot(p, (phone ? 'phone' : 'desktop') + '-split-saved');
  await p.click('.s-toast button:has-text("Undo")'); await p.waitForTimeout(700);
  const z = await db(p);
  ok(z.stays.length === before && z.stays.find(q => q.id === s.id).departure === s.departure, 'Undo reverts both parts of the split');
}
p = await pg(1440, 950);
await splitCase(p, false);

// ---------- phone: room cards -> bottom sheet ----------
p = await pg(390, 844, 'rooms');
await shot(p, 'phone-toggle');
ok((await p.locator('.q-switch1').getAttribute('aria-checked')) === 'true', 'phone: compact switch shows Quick on');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: header fits, no horizontal overflow');
await p.locator('.rcard .qup').first().click(); await settle(p);
ok(await p.locator('.q-scrim .q-panel.sheet').isVisible(), 'phone: Quick update opens the bottom sheet');
await shot(p, 'phone-quick-card');
await p.click('.q-x'); await settle(p);
// a free room -> prefilled booking
{
  const x = await db(p);
  const free = x.rooms.filter(r => /^(lr|es)-/.test(r.id)).find(r => !x.stays.some(s => s.roomId === r.id && s.arrival <= D(0) && (s.departure ?? '9') > D(0)) && !x.stays.some(s => s.roomId === r.id && s.arrival > D(0)));
  if (free) {
    await p.locator(`.rcard[data-room="${free.id}"] .qup`).click(); await settle(p);
    ok(await p.locator('.q-panel h2:has-text("Who is staying")').isVisible(), 'phone: a free room starts the quick booking');
    ok((await p.locator('.q-panel .s-sub').innerText()).includes(free.name), 'phone: prefilled with that room');
    await shot(p, 'phone-free-room-booking');
    await p.click('.q-panel .s-pick.tbc'); await settle(p);
    ok(await p.locator('.q-panel h2:has-text("When are they leaving")').isVisible(), 'phone: arrival skipped (today from the card)');
    await shot(p, 'phone-free-room-leaving');
    await p.click('.q-x'); await settle(p);
  } else ok(false, 'phone: found a free room with nothing booked later');
}
// Classic on phone = old panel
await p.click('.q-switch1'); await settle(p);
await p.locator('.rcard .qup').first().click(); await settle(p);
ok(await p.locator('.panel').isVisible() && !(await p.locator('.q-panel').count()), 'phone Classic: the classic panel, as before');
await shot(p, 'phone-classic-panel');
await p.goto(U + '#rooms'); await settle(p);
await p.evaluate(() => localStorage.setItem('rb-ui-mode', 'quick')); await p.reload(); await settle(p);
await splitCase(p, true);

// ---------- Sheena: quick card never shows cleaner names ----------
p = await pg(390, 844, 'rooms');
await p.selectOption('select.who', 'u-client'); await settle(p);
const names = (await db(p)).users.filter(u => u.role === 'cleaner').map(u => u.name.split(' ')[0]);
let leaked = false;
for (let i = 0; i < Math.min(6, await p.locator('.rcard .qup').count()); i++) {
  await p.locator('.rcard .qup').nth(i).click(); await settle(p);
  const t = await p.locator('.q-panel').innerText();
  if (names.some(n => t.includes(n))) leaked = true;
  await p.click('.q-x'); await settle(p);
}
ok(!leaked, 'Sheena: no cleaner names in quick cards');

ok(!errs.length, 'no console/page errors ' + errs.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
