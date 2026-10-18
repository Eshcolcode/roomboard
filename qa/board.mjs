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
  await p.locator('.row[data-room="lr-6"]').scrollIntoViewIfNeeded(); // rooms now list Eshcol first
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
  const btn = p.locator('.q-panel [data-fix="split"] button');
  ok(await btn.isVisible(), (phone ? 'phone' : 'desktop') + ': split-stay offered (keep room, extra nights elsewhere)');
  const order = await p.locator('.q-panel .s-fix').evaluateAll(es => es.map(e => e.dataset.fix));
  ok(order[0] === 'split' && order.includes('move'), 'split-stay is the first option, whole-stay move after it (' + order.join(', ') + ')');
  ok(/cleaned on/.test(await p.locator('.q-panel [data-fix="split"]').innerText()), 'split explains the room-change clean');
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
await p.click('.bottom button:has-text("More")'); await settle(p);
ok(await p.locator('.q-more [aria-checked="true"]:has-text("Quick")').isVisible(), 'phone: Quick/Classic switch in the More menu, Quick on');
await shot(p, 'phone-toggle');
await p.click('.scrim'); await settle(p);
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
await p.click('.bottom button:has-text("More")'); await settle(p);
await p.click('.q-more button:has-text("Classic")'); await settle(p);
await p.click('.scrim'); await settle(p);
await p.locator('.rcard .qup').first().click(); await settle(p);
ok(await p.locator('.panel').isVisible() && !(await p.locator('.q-panel').count()), 'phone Classic: the classic panel, as before');
await shot(p, 'phone-classic-panel');
await p.goto(U + '#rooms'); await settle(p);
await p.evaluate(() => localStorage.setItem('rb-ui-mode', 'quick')); await p.reload(); await settle(p);
await splitCase(p, true);

// ---------- widths: no overflow, header fits ----------
for (const w of [360, 390, 768, 1024, 1280, 1440]) {
  const q = await pg(w, 900, 'board');
  const r = await q.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    right: Math.max(...[...document.querySelector('.top').children].map(e => e.getBoundingClientRect().right)),
  }));
  ok(r.sw <= w && r.right <= w + 0.5, `width ${w}: no overflow, header fits (${r.sw}, ${Math.round(r.right)})`);
  if (w === 360 || w === 1024) await q.screenshot({ path: OUT + `board-header-${w}.png`, clip: { x: 0, y: 0, width: w, height: 70 } });
  await q.close();
}

// ---------- desktop: board shrinks beside the panel, tapped booking highlighted and in view ----------
for (const w of [1024, 1440]) {
  const q = await pg(w, 900, 'board');
  const bar = q.locator('.row[data-room="es-2"] .bar').first();
  await bar.scrollIntoViewIfNeeded();
  await bar.click(); await q.waitForTimeout(700);
  const sc = await q.locator('.board').boundingBox();
  const bb = await q.locator('.row[data-room="es-2"] .bar').first().boundingBox();
  ok(sc.x + sc.width <= w - 470 + 2, `desktop ${w}: board reflows beside the panel`);
  ok(bb.x < w - 470 && bb.y > 60 && bb.y < 900, `desktop ${w}: tapped booking stays in view`);
  ok(/outline/.test(await q.evaluate(() => document.querySelector('style:last-of-type')?.textContent ?? '')), `desktop ${w}: tapped booking highlighted`);
  if (w === 1024) await shot(q, 'desktop-1024-reflow');
  await q.close();
}

// ---------- phone: swipe the sheet down to close; Hold skips arrival ----------
p = await pg(390, 844, 'rooms');
await p.locator('.rcard .qup').first().click(); await settle(p);
{
  const bar = await p.locator('.q-bar').boundingBox();
  await p.mouse.move(bar.x + 60, bar.y + 20); await p.mouse.down();
  await p.mouse.move(bar.x + 60, bar.y + 220, { steps: 6 }); await p.mouse.up(); await settle(p);
  ok(!(await p.locator('.q-panel').count()), 'phone: swipe down on the handle closes the sheet');
  await p.locator('.rcard .qup').first().click(); await settle(p);
  await p.mouse.move(bar.x + 60, bar.y + 20); await p.mouse.down();
  await p.mouse.move(bar.x + 60, bar.y + 50, { steps: 3 }); await p.mouse.up(); await settle(p);
  ok(await p.locator('.q-panel').isVisible(), 'phone: a small drag snaps back (sheet stays open)');
  await p.keyboard.press('Escape'); await settle(p);
  ok(!(await p.locator('.q-panel').count()), 'phone: Esc closes the sheet');
}
await p.click('.fab .btn.ghost:has-text("Hold")'); await settle(p);
ok(await p.locator('.q-panel h2:has-text("When are they leaving")').isVisible(), 'Hold: goes straight to the leaving date (today, Name TBC)');
ok(await p.locator('.q-panel button:has-text("Change arrival")').isVisible(), 'Hold: arrival can still be changed in one tap');
await shot(p, 'phone-hold-skip');
await p.click('.q-panel button:has-text("Change arrival")'); await settle(p);
ok(await p.locator('.q-panel h2:has-text("When are they arriving")').isVisible(), 'Change arrival opens the arrival question');
await p.click('.q-x'); await settle(p);

// ---------- same person: join the two stays ----------
{
  const x = await db(p);
  const pair = x.stays
    .filter(s => s.workerId && s.departure && s.departure > T)
    .map(s => [s, x.stays.filter(n => n.roomId === s.roomId && n.id !== s.id && n.arrival >= s.departure).sort((a, c) => a.arrival.localeCompare(c.arrival))[0]])
    .find(([s, n]) => n && n.workerId === s.workerId);
  if (pair) {
    const [s, n] = pair;
    await p.goto(U + '#rooms'); await settle(p);
    await p.locator(`.rcard[data-room="${s.roomId}"] .qup`).click(); await settle(p);
    await p.click('.q-panel .s-act:has-text("Staying longer")'); await settle(p);
    for (let i = 0; i < 40 && !(await p.locator('.q-panel .s-fix').count()); i++) await p.click('.q-panel [aria-label="Leaving: one day later"]');
    ok((await p.locator('.q-panel .s-fix').first().getAttribute('data-fix')) === 'join', 'same person: "Join into one stay" offered first');
    await shot(p, 'phone-join');
    await p.click('.q-panel [data-fix="join"] button'); await settle(p);
    const y = await db(p);
    ok(!y.stays.some(z => z.id === n.id) && y.stays.find(z => z.id === s.id).departure === n.departure, 'joined: one stay until the later date');
    await p.click('.s-toast button:has-text("Undo")'); await p.waitForTimeout(700);
    const z = await db(p);
    ok(z.stays.some(q => q.id === n.id) && z.stays.find(q => q.id === s.id).departure === s.departure, 'Undo splits them back (one step)');
  } else ok(false, 'seed has a same-person back-to-back pair');
}

// ---------- crew rota: this rotation vs all from here ----------
p = await pg(390, 844, 'simple');
await p.click('text=Book a room'); await settle(p);
await p.click('.s-pick:has-text("A crew")'); await settle(p);
await p.click('.s-chip:has-text("4")'); await p.click('button:has-text("Next")'); await settle(p);
await p.click('[aria-label="Next month"]'); await p.click('[aria-label="Next month"]'); await settle(p);
await p.locator('.s-calgrid .d:not([disabled])').nth(4).click(); await p.waitForTimeout(700);
await p.click('.s-chip:has-text("10 nights")'); await p.waitForTimeout(700);
await p.click('button:has-text("Hold these")'); await settle(p);
await p.click('.s-extra:has-text("Repeat as a rota")'); await settle(p);
await p.click('.s-chip:has-text("10 on · 4 off")'); await settle(p);
await p.click('.s-chip:has-text("8 weeks")'); await settle(p);
await p.click('.s-pick:has-text("Keep the room")'); await p.waitForTimeout(700);
const ser = (await db(p)).stays.filter(s => s.seriesId && s.holdLabel?.startsWith('Name TBC'));
ok(ser.length >= 12, 'crew of 4 on a rota (' + ser.length + ' stays)');
await p.click('button:has-text("Open booking")'); await settle(p);
await p.click('button:has-text("Change whole crew")'); await settle(p);
ok(await p.locator('.s-chip:has-text("All from here")').isVisible(), 'crew: "This rotation" / "All from here" choice');
await p.click('.s-chip:has-text("All from here")'); await settle(p);
await shot(p, 'crew-scope');
await p.click('.s-act:has-text("Shift every date")'); await settle(p);
await p.click('[aria-label="One day later"]'); await settle(p);
await p.click('.s-box button:has-text("Save")'); await settle(p);
const ser2 = (await db(p)).stays.filter(s => ser.some(o => o.id === s.id));
ok(ser2.every(s => s.arrival === D(Math.round((Date.parse(ser.find(o => o.id === s.id).arrival) - Date.parse(T)) / 864e5) + 2)), 'all rotations of all 4 moved 2 days later in one go');
await p.click('.s-toast button:has-text("Undo")'); await p.waitForTimeout(700);
const ser3 = (await db(p)).stays.filter(s => ser.some(o => o.id === s.id));
ok(ser3.every(s => s.arrival === ser.find(o => o.id === s.id).arrival), 'one Undo puts every rotation back');

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
