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
  await p.evaluate(m => { localStorage.clear(); for (const id of ['u-eshcol', 'u-client', 'u-housekeeper']) localStorage.setItem('rb-welcome:' + id, '1'); if (m) localStorage.setItem('rb-ui-mode', m); }, mode);
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
  {
    // Eshcol, 18 Oct 2026: Eshcol / Loch Roag are on the block contract, so the "Room held" sheet shows no money
    const t = await p.locator('.q-panel').innerText();
    ok(!/£|indicative|estimate/i.test(t) && t.includes('Included in your contract'), '"Room held" for a contract room: no price, "Included in your contract"');
  }
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
// the crew rota (series) is made on the Crew screen; the quick booking only offers shift patterns
p = await pg(1440, 1000, 'crew');
await p.fill('#c-label', 'QA crew');
await p.selectOption('#c-prop', 'p-es');
{
  const d0 = D(60);
  await p.fill('#c-start', `${d0.slice(8, 10)}/${d0.slice(5, 7)}/${d0.slice(0, 4)}`);
  await p.locator('#c-start').blur();
}
await p.fill('#c-holds', '4');
await p.fill('#c-on', '10'); await p.fill('#c-off', '4');
await p.waitForTimeout(300);
await p.click('button:has-text("Confirm")'); await settle(p);
await p.click('.dialog button:has-text("Book")'); await p.waitForTimeout(800);
const ser = (await db(p)).stays.filter(s => s.seriesId);
ok(ser.length >= 12, 'crew of 4 on a rota (' + ser.length + ' stays)');
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(U + '#simple/stay/' + ser.sort((a, b) => a.arrival.localeCompare(b.arrival))[0].id);
await p.reload(); await settle(p);
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

// ---------- RJ McLeod: quick card never shows cleaner names ----------
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
ok(!leaked, 'RJ McLeod: no cleaner names in quick cards');

// ---------- regression (18 Oct 2026): set an end date on an open-ended stay, every mode and width ----------
{
  const firstDep = arr => [D(7), new Date(Date.parse(arr + 'T00:00Z') + 7 * 864e5).toISOString().slice(0, 10)].sort().pop();
  const alasdair = async p => (await db(p)).stays.find(s => s.roomId === 'es-1' && s.workerId === 'w-16');
  const barEnd = async p => {
    const r = await p.locator('.row[data-room="es-1"] .bar').first().boundingBox();
    return r.x + r.width;
  };
  const otherOpen = async p => (await db(p)).stays.find(s => s.depStatus === 'ufn' && !s.departure && s.roomId !== 'es-1' && /^(es|lr)-/.test(s.roomId));
  for (const [w, h, mode] of [[1440, 950, 'quick'], [1440, 950, 'classic'], [390, 844, 'quick'], [390, 844, 'classic']]) {
    const tag = `${w < 500 ? 'phone' : 'desktop'} ${mode}`;
    const p = await pg(w, h, w < 500 ? 'rooms' : 'board', mode);
    const s0 = await alasdair(p);
    if (!(s0 && s0.depStatus === 'ufn' && !s0.departure)) { ok(false, tag + ': Alasdair is open-ended in the demo'); continue; }
    const before = w < 500 ? null : await barEnd(p);
    const openIt = async () => {
      if (w < 500) {
        await p.locator('.rcard[data-room="es-1"]').scrollIntoViewIfNeeded();
        await p.locator(mode === 'quick' ? '.rcard[data-room="es-1"] .qup' : '.rcard[data-room="es-1"]').first().click();
      } else await p.locator('.row[data-room="es-1"] .bar').first().click();
      await settle(p);
    };
    await openIt();
    let want;
    if (mode === 'quick') {
      await p.click('.q-panel .s-act:has-text("Set leaving date")'); await settle(p);
      want = firstDep(s0.arrival);
      await p.click('.q-panel .s-btn.big:has-text("Save")'); await p.waitForTimeout(800);
    } else {
      if (!(await p.locator('.panel #f-dep').count())) await p.locator('.rcard[data-room="es-1"] button, .rcard[data-room="es-1"] a').first().click();
      await settle(p);
      want = D(5);
      ok(!(await p.locator('.panel #f-dep').isDisabled()), tag + ': the Leaves box can be filled on an open-ended stay');
      await p.locator('.panel #f-dep').fill(want.split('-').reverse().join('/'));
      await p.locator('.panel #f-dep').blur();
      await p.click('.panel .btn.primary'); await p.waitForTimeout(800);
    }
    const s1 = await alasdair(p);
    ok(s1.departure === want && s1.depStatus === 'planned', `${tag}: end date saved on Alasdair (open-ended → ${want}, ${s1.depStatus})`);
    if (w >= 500) {
      if (await p.locator('.q-x').count()) await p.click('.q-x');
      await p.keyboard.press('Escape'); await settle(p);
      const after = await barEnd(p);
      ok(after < before - 50, `${tag}: the board bar now stops at the leaving date (${Math.round(before)} → ${Math.round(after)}px)`);
      // the nights after it are free: an empty cell there starts a booking
      ok(!(await p.locator('.row[data-room="es-1"] .bar').first().innerText()).includes('UFN'), `${tag}: no longer shown as until further notice`);
    } else {
      if (await p.locator('.q-x').count()) await p.click('.q-x');
      await p.keyboard.press('Escape'); await settle(p);
      const t = await p.locator('.rcard[data-room="es-1"]').innerText();
      ok(!/Until further notice/.test(t), `${tag}: the room card updates straight away`);
    }
    // the nights after the end date are free for a new booking
    const free = (await db(p)).stays.filter(s => s.roomId === 'es-1' && s.arrival < D(30) && (s.departure ?? '9') > want);
    ok(free.length === 0, `${tag}: nights after ${want} are free in Room 1`);
    // the same on a second open-ended stay, Quick: then make it open-ended again
    if (mode === 'quick' && w >= 500) {
      const o = await otherOpen(p);
      await p.locator(`.row[data-room="${o.roomId}"]`).scrollIntoViewIfNeeded();
      await p.locator(`.row[data-room="${o.roomId}"] [data-stay="${o.id}"], .row[data-room="${o.roomId}"] .bar`).first().click(); await settle(p);
      await p.click('.q-panel .s-act:has-text("Change dates")'); await settle(p);
      await p.click('.q-panel button:has-text("Set a leaving date")'); await settle(p);
      await p.click('.q-panel .s-btn.big:has-text("Save")'); await p.waitForTimeout(800);
      const o1 = (await db(p)).stays.find(s => s.id === o.id);
      ok(o1.departure === firstDep(o.arrival) && o1.depStatus === 'planned', `${tag}: Change dates → Set a leaving date saves too (${o.roomId})`);
      await p.locator(`.row[data-room="${o.roomId}"] .bar`).first().click(); await settle(p);
      await p.click('.q-panel .s-act:has-text("Change dates")'); await settle(p);
      await p.click('.q-panel .s-link:has-text("No leaving date yet")'); await settle(p);
      await p.click('.q-panel .s-btn.big:has-text("Save")'); await p.waitForTimeout(800);
      const o2 = (await db(p)).stays.find(s => s.id === o.id);
      ok(o2.departure === null && o2.depStatus === 'ufn', `${tag}: and back to until further notice`);
      // change the start of an open-ended stay: stays open-ended (it used to turn into TBC)
      await p.locator(`.row[data-room="${o.roomId}"] .bar`).first().click(); await settle(p);
      await p.click('.q-panel .s-act:has-text("Change dates")'); await settle(p);
      await p.click('.q-panel [aria-label="Arriving: one day later"]'); await settle(p);
      await p.click('.q-panel .s-btn.big:has-text("Save")'); await p.waitForTimeout(800);
      const o3 = (await db(p)).stays.find(s => s.id === o.id);
      ok(o3.arrival > o.arrival && o3.departure === null && o3.depStatus === 'ufn', `${tag}: changing the start keeps it until further notice`);
    }
    await p.close();
  }
}

// ---------- extras group header on the desktop board: label and price note never overlap or clip ----------
for (const w of [1440, 1100]) {
  const p = await pg(w, 900);
  await p.selectOption('select.who', 'u-client'); await settle(p);
  for (const state of ['', 'scrolled', 'side panel open']) {
    if (state === 'scrolled') await p.evaluate(() => { document.querySelector('.board > .scroll').scrollLeft = 600; });
    if (state === 'side panel open') { await p.locator('.row[data-room="lr-1"] .bar').first().click(); await settle(p); }
    await p.locator('.xgrp').scrollIntoViewIfNeeded(); await settle(p);
    const r = await p.evaluate(() => {
      const g = document.querySelector('.xgrp .gl').getBoundingClientRect();
      const n = document.querySelector('.xgrp-note').getBoundingClientRect();
      const lab = document.querySelector('.xgrp .gl > div');
      const spans = [...document.querySelectorAll('.xgrp .gl b, .xgrp .gl span')].map(e => e.getBoundingClientRect());
      const sc = document.querySelector('.board > .scroll').getBoundingClientRect();
      return {
        gw: g.width, gl: g.left, gr: g.right, nl: n.left, nr: n.right,
        clip: lab.scrollWidth > lab.clientWidth + 1,
        inside: spans.every(x => x.left >= g.left - 1 && x.right <= g.right + 1),
        lines: spans.length === 2 && spans[1].top >= spans[0].bottom - 1,
        vw: Math.min(innerWidth, sc.right),
      };
    });
    ok(r.gw >= 229 && r.gl >= -1 && r.nl >= r.gr - 1 && r.nr <= r.vw + 1 && !r.clip && r.inside && r.lines,
      `extras header (${w}px${state ? ', ' + state : ''}): label column ${Math.round(r.gw)}px, note ${Math.round(r.nl)}–${Math.round(r.nr)} beside it, nothing overlaps or clips`);
  }
  if (w === 1440) { await p.locator('.xgrp').scrollIntoViewIfNeeded(); await shot(p, 'extras-header'); }
  await p.close();
}

// ---------- extras: the same guest details as a contract room (name picker, new name, phone, notes), RJ McLeod ----------
for (const mode of ['quick', 'classic'])
  for (const [w, h, tag] of [[1440, 950, 'desktop'], [390, 844, 'phone']]) {
    const t = `extras ${mode} ${tag}`;
    const p = await pg(w, h, w > 900 ? 'board' : 'rooms', mode);
    await p.selectOption('select.who', 'u-client'); await settle(p);
    if (w > 900) {
      await p.locator('[data-extra="p-pod1"]').scrollIntoViewIfNeeded();
      const W = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.track')).backgroundSize));
      const tl = await p.evaluate(() => parseFloat(document.querySelector('.todayline').style.left));
      const tr = await p.locator('[data-extra="p-pod1"] .track').boundingBox();
      await p.mouse.click(tr.x + (Math.round((tl - W / 2) / W) + 3) * W + W / 2, tr.y + tr.height / 2);
    } else await p.locator('.xcard[data-extra="p-pod1"] button.xd.f').nth(2).click();
    await settle(p);
    await p.locator('[data-sheet="p-pod1"] .av-go').click(); await settle(p);
    const q = p.locator('.q-panel'), f = p.locator('aside.panel');
    if (mode === 'quick') {
      ok(await q.locator('input[aria-label="Name"]').isVisible() && (await q.locator('.s-pick.tbc').isVisible()), `${t}: "Book these dates" asks who (workers list, new name or name to follow)`);
      await q.locator('input[aria-label="Name"]').fill('Callum');
      await q.locator('.s-pick:has-text("Callum MacLeod")').first().click(); await settle(p);
    } else {
      ok(await f.locator('#f-wq').isVisible() && (await f.locator('#f-notes').isVisible()) && (await f.locator('.xtag').isVisible()), `${t}: "Book these dates" opens the stay form (worker picker, notes, badge)`);
      await f.locator('#f-wq').fill('Callum');
      await f.locator('.chips .chip:has-text("Callum MacLeod")').first().click();
      await f.locator('#f-notes').fill('Classic note');
      await f.locator('.pa .btn.primary').click(); await settle(p);
    }
    let x = await db(p);
    const cm = x.workers.find(v => v.name === 'Callum MacLeod');
    const st = x.stays.find(s => s.roomId === 'x-pod1' && s.workerId === cm.id && s.bookedBy === 'u-client');
    ok(!!st, `${t}: RJ McLeod books Harris with a worker picked from their list`);
    if (mode === 'quick') {
      await q.locator('.s-extra:has-text("Phone number")').click();
      await q.locator('input[aria-label="Phone number"]').fill('07700 900444');
      await q.locator('button[type=submit]:has-text("Save")').click(); await settle(p);
      ok((await db(p)).workers.find(v => v.id === cm.id).phone === '07700 900444', `${t}: phone added at creation (on the worker)`);
      await q.locator('.s-btn:has-text("Open booking")').click(); await settle(p);
      ok(!(await q.innerText()).includes('Move room') && (await q.innerText()).includes('Swap person'), `${t}: the booking card has Swap person (no Move room)`);
      await q.locator('.s-act:has-text("Swap person")').click();
      await q.locator('input[aria-label="Name"]').fill('Morag Edit ' + tag);
      await q.locator('input[aria-label="Name"]').press('Enter'); await settle(p);
      await q.locator('[data-act="details"]').click();
      await q.locator('input[aria-label="Phone number"]').fill('07700 900555');
      await q.locator('textarea[aria-label="Notes"]').fill('Edited note');
      await q.locator('button[type=submit]:has-text("Save")').click(); await settle(p);
      x = await db(p);
      const mo = x.workers.find(v => v.name === 'Morag Edit ' + tag);
      const s2 = x.stays.find(s => s.id === st.id);
      ok(!!mo && s2.workerId === mo.id && mo.phone === '07700 900555' && s2.notes === 'Edited note', `${t}: edit swaps to a new name, sets phone and notes`);
    } else {
      ok(st.notes === 'Classic note', `${t}: notes saved at creation`);
      if (w > 900) await p.locator(`[data-extra="p-pod1"] [data-stay="${st.id}"]`).first().click();
      else await p.locator('.xcard[data-extra="p-pod1"] .xbtns .btn.ghost').click();
      await settle(p);
      ok(await f.isVisible() && /Callum MacLeod/.test(await f.innerText()), `${t}: the booking opens in the stay form`);
      await f.locator('.chosen .link:has-text("Change")').click();
      await f.locator('#f-wq').fill('Euan');
      await f.locator('.chips .chip:has-text("Euan Morrison")').first().click();
      await f.locator('#f-notes').fill('Edited note');
      await f.locator('.pa .btn.primary').click(); await settle(p);
      x = await db(p);
      const eu = x.workers.find(v => v.name === 'Euan Morrison');
      const s2 = x.stays.find(s => s.id === st.id);
      ok(s2.workerId === eu.id && s2.notes === 'Edited note', `${t}: edit picks another worker and changes the notes`);
    }
    ok(!(await p.locator('body').innerText()).includes('Direct guest'), `${t}: Eshcol's own guest still never shown to RJ McLeod`);
    await p.close();
  }

ok(!errs.length, 'no console/page errors ' + errs.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
