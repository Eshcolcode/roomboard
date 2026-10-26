// Properties + extra-property bookings (direct, whole property) + prices + board extras + availability page. node qa/props.mjs (preview on :4173 or QA_URL).
// Screens go to SHOTS (default /workspace/flow-shots) as props-*.png.
import { chromium } from 'playwright';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = (process.env.SHOTS ?? '/workspace/flow-shots') + '/';
const b = await chromium.launch({
  executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
let pass = 0,
  fail = 0;
const errs = [];
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
};
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const D = n => new Date(Date.parse(T + 'T00:00Z') + n * 864e5).toISOString().slice(0, 10);
const settle = p => p.waitForTimeout(400);
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
const shot = (p, n, full = false) => p.screenshot({ path: OUT + 'props-' + n + '.png', fullPage: full });
async function pg(w, h, hash, { user = 'u-eshcol', mode = null } = {}) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#' + hash);
  await p.evaluate(
    ({ m }) => {
      localStorage.clear();
      for (const id of ['u-eshcol', 'u-client', 'u-housekeeper']) localStorage.setItem('rb-welcome:' + id, '1');
      if (m) localStorage.setItem('rb-ui-mode', m);
    },
    { m: mode },
  );
  await p.reload();
  await settle(p);
  if (user !== 'u-eshcol') await as(p, user);
  return p;
}
// switch person on either header (main app .who, stand-alone page .s-who)
async function as(p, id) {
  const sel = (await p.locator('select.who').count()) ? 'select.who' : 'select.s-who';
  await p.selectOption(sel, id);
  await settle(p);
}
// After "Book these dates": the same booking flow as the contract rooms. Quick: "Who is staying?" then
// "<Property> booked!" with phone / notes / rota; Classic: the stay form. name = a new name, worker = a saved
// worker picked from the list, neither = name to follow.
async function whoNext(p, { name, worker } = {}) {
  await settle(p);
  if (await p.locator('aside.panel').count()) {
    const f = p.locator('aside.panel');
    if (worker) {
      await f.locator('#f-wq').fill(worker.split(' ')[0]);
      await f.locator(`.chips .chip:has-text("${worker}")`).first().click();
    } else {
      await f.locator('.seg button:has-text("Hold · name to follow")').click();
      if (name) await f.locator('#f-hold').fill(name);
    }
    await f.locator('.pa .btn.primary').click();
  } else {
    const q = p.locator('.q-panel');
    const box = q.locator('input[aria-label="Name"]');
    if (worker) {
      await box.fill(worker.split(' ')[0]);
      await q.locator(`.s-pick:has-text("${worker}")`).first().click();
    } else if (name) {
      await box.fill(name);
      await box.press('Enter');
    } else await q.locator('.s-pick.tbc').click();
  }
  await settle(p);
}
// first run of n free nights (from day >= 2) in a unit, by reading the grid itself
async function pickFree(p, scope, n) {
  const days = await p
    .locator(scope + ' .av-d')
    .evaluateAll(bs =>
      bs.map(x => ({ label: x.getAttribute('aria-label'), free: x.classList.contains('s-free') && !x.disabled })),
    );
  for (let i = 2; i + n < days.length; i++)
    if (days.slice(i, i + n).every(d => d.free)) {
      await p
        .locator(scope + ' .av-d')
        .nth(i)
        .click();
      await p
        .locator(scope + ' .av-d')
        .nth(i + n)
        .click();
      return i;
    }
  return -1;
}
// page text without the demo-only login switcher (select.who / select.s-who lists 'Housekeeper' as a login,
// which is a role, not a person); the cleaner is never named or mentioned anywhere else on a client page
const pageText = p =>
  p.evaluate(() => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll('select.who, select.s-who').forEach(e => e.remove());
    document.body.appendChild(c);
    c.style.position = 'absolute';
    const t = c.innerText;
    c.remove();
    return t;
  });
const cleanerFree = t => !/Housekeeper|Mairi/.test(t);

// ---------- availability page as RJ McLeod (phone) ----------
let p = await pg(390, 844, 'availability', { user: 'u-client' });
ok(await p.locator('.avp-sim:has-text("Simulated")').isVisible(), 'availability: demo is labelled Simulated');
ok((await p.locator('.avp-card').count()) === 4, 'availability: all 4 extra properties');
ok((await p.locator('.avp-card .av-month').count()) === 12, 'availability: 3 months for each');
ok(
  (await p.locator('.avp-card .xtag:has-text("Extra · invoiced separately")').count()) === 4,
  'availability: every unit labelled extra, invoiced separately',
);
ok((await p.locator('.avp-card img').count()) >= 3, 'availability: photos shown where we have them');
{
  const x = await db(p);
  const monadh = await p.locator('[data-unit="x-monadh"] .av-d').evaluateAll(bs => bs.map(b => b.className));
  const blocked = x.blocks.filter(k => k.roomId === 'x-monadh');
  ok(
    blocked.length > 0 && monadh.some(c => c.includes('s-elsewhere')),
    'availability: Monadh calendar dates show as taken (booked elsewhere)',
  );
  ok(
    !x.blocks.some(k => k.roomId !== 'x-monadh') &&
      !(await p.locator('[data-unit="x-pod1"] .av-d.s-elsewhere, [data-unit="x-cottage"] .av-d.s-elsewhere').count()),
    'availability: calendars not linked yet block nothing',
  );
  const body = await pageText(p);
  ok(
    !x.workers.some(w => body.includes(w.name)) && cleanerFree(body),
    'privacy: no guest or cleaner names on the availability page',
  );
  ok(!/Airbnb|Booking\.com|SuperControl/.test(body), 'privacy: RJ McLeod does not see which site a booking came from');
  ok(!/Guestname|01632|example\.invalid/.test(body), 'privacy: no guest details from the calendar feed');
}
await p.locator('#av-p-pod1').scrollIntoViewIfNeeded();
await shot(p, '1-availability-phone');
ok(
  JSON.stringify(await p.locator('.avp-card').evaluateAll(cs => cs.map(c => c.id))) ===
    JSON.stringify(['av-p-pod1', 'av-p-pod2', 'av-p-monadh', 'av-p-cottage']),
  'availability: order Harris, Uig, Monadh, Abhainn Cottage',
);
ok(
  (await p.locator('.avp-card .price-line:has-text("Indicative £350 per room per week")').count()) === 4 &&
    (await p.locator('#av-p-cottage .price-line').innerText()).includes('2 rooms charged = £700 a week'),
  'availability: indicative price on every extra (Abhainn whole property, 2 rooms charged = £700)',
);
const iPick = await pickFree(p, '[data-unit="x-pod1"]', 3);
ok(
  iPick >= 0 && (await p.locator('[data-unit="x-pod1"] .av-go:has-text("Book these dates")').isVisible()),
  'RJ McLeod: picking dates shows "Book these dates" (no request step)',
);
ok(
  (await p.locator('[data-unit="x-pod1"] .av-est').innerText()).includes(
    'Indicative £150 for 3 nights (£350 a week ÷ 7 × 3)',
  ),
  'RJ McLeod: pro-rata estimate before booking',
);
await p.fill('[data-unit="x-pod1"] .av-who input', 'Calum Test');
{
  const h = (await p.locator('[data-unit="x-pod1"] .av-who input').boundingBox()).height;
  ok(h >= 44 && h <= 80, 'booking bar: the name box is a normal size (' + Math.round(h) + 'px)');
}
await p.locator('[data-unit="x-pod1"] .av-bar').scrollIntoViewIfNeeded();
await shot(p, '2-book-phone');
await p.click('[data-unit="x-pod1"] .av-go');
await settle(p);
{
  const m = await p.locator('[data-unit="x-pod1"] .av-msg.ok').innerText();
  ok(
    m.includes('Booked and confirmed') &&
      m.includes('Eshcol has been notified') &&
      m.includes('£150') &&
      /long-term/.test(m),
    'confirmation: booked straight away, Eshcol notified, indicative £150, long-term deals possible',
  );
}
let bk1 = (await db(p)).stays.find(s => s.roomId === 'x-pod1' && s.holdLabel === 'Calum Test');
ok(bk1 && bk1.bookedBy === 'u-client' && !('request' in bk1), 'client booking of an extra is a confirmed booking');
ok(
  (await p.locator('[data-unit="x-pod1"] .av-d.s-mine').count()) === 3,
  'RJ McLeod: their booked nights show as "Yours"',
);
ok(
  (await p.locator('[data-unit="x-pod1"] .av-yours').innerText()).includes('Calum Test') &&
    (await p.locator('[data-unit="x-pod1"] .av-d.s-mine').first().getAttribute('aria-label')).includes('yours'),
  'RJ McLeod: "Your bookings here" lists it',
);
ok(!(await p.locator('[data-unit="x-cottage"] .av-d.s-mine').count()), "Eshcol's guest is not shown as hers");
ok(
  (await db(p)).alerts.some(a => a.toUserId === 'u-eshcol' && /New booking/.test(a.subject) && /£150/.test(a.body)),
  'Eshcol is alerted, with the indicative price',
);
// a booked-elsewhere night cannot be picked
ok(
  await p.locator('[data-unit="x-monadh"] .av-d.s-elsewhere').first().isDisabled(),
  'booked-elsewhere nights cannot be picked',
);

// ---------- the main board includes the extras (desktop), RJ McLeod ----------
await p.setViewportSize({ width: 1440, height: 950 });
await p.goto(U + '#board');
await settle(p);
await p.click('.seg button:has-text("6 wks")');
await settle(p);
ok(
  JSON.stringify(await p.locator('.xrow').evaluateAll(rs => rs.map(r => r.dataset.extra))) ===
    JSON.stringify(['p-pod1', 'p-pod2', 'p-monadh', 'p-cottage']),
  'board: extra properties live on the main board, in order, after Eshcol and Loch Roag',
);
ok(
  JSON.stringify(await p.locator('.board .grp .gl b').evaluateAll(bs => bs.map(b => b.textContent))) ===
    JSON.stringify(['Eshcol', 'Loch Roag', 'Extra properties']),
  'board: group order Eshcol, Loch Roag, extras',
);
ok(
  (await p.locator(`[data-extra="p-pod1"] .xbar[data-stay="${bk1.id}"]`).count()) === 1,
  'board: RJ McLeod sees their own extra booking',
);
{
  const row = await p.locator('[data-extra="p-cottage"]').innerText();
  ok(
    (await p.locator('[data-extra="p-cottage"] .xblock').count()) >= 1 && !row.includes('Direct guest'),
    "board: Eshcol's own guest shows to RJ McLeod as Taken, no name",
  );
  ok(
    (await p.locator('[data-extra="p-monadh"] .xblock').count()) >= 1 &&
      !(await p.locator('[data-extra="p-monadh"] .xblock.elsewhere').count()),
    'board: Monadh calendar dates show to RJ McLeod as Taken (no site)',
  );
  ok(
    /Indicative £350 per room per week/.test(await p.locator('.xgrp').innerText()),
    'board: price note on the extras group',
  );
}
await shot(p, '3-board-rj');
await p.click('[data-extra="p-pod1"] .xbar');
await settle(p);
{
  const t = await p.locator('.q-panel').innerText();
  ok(
    t.includes('Indicative £150 for 3 nights') && t.includes('Long-term deals possible'),
    'Quick card: indicative estimate',
  );
  ok(
    /\bCancel\b/.test(t) && !/Confirm|Decline/.test(t),
    'Quick card: no confirm/decline; RJ McLeod can cancel their own',
  );
  ok(
    t.includes('Add the name') &&
      t.includes('Change dates') &&
      /Add phone or notes/.test(t) &&
      !t.includes('Move room') &&
      t.includes('whole property'),
    'Quick card (extra): the same guest actions as a contract booking (name, phone/notes, dates), no Move room',
  );
}
await shot(p, '3b-extra-card');
// RJ McLeod names their extra booking from the workers list they holds, then adds a phone and notes
{
  const q = p.locator('.q-panel');
  await q.locator('.s-act:has-text("Add the name")').click();
  await q.locator('input[aria-label="Name"]').fill('Euan');
  await q.locator('.s-pick:has-text("Euan Morrison")').first().click();
  await settle(p);
  const w = (await db(p)).workers.find(x => x.name === 'Euan Morrison');
  let s = (await db(p)).stays.find(x => x.id === bk1.id);
  ok(!!w && s.workerId === w.id && !s.holdLabel, 'extra (Quick, desktop): name picked from the workers list');
  await q.locator('[data-act="details"]').click();
  await q.locator('input[aria-label="Phone number"]').fill('07700 900111');
  await q.locator('textarea[aria-label="Notes"]').fill('Late ferry, arrives 11pm');
  await q.locator('button[type=submit]:has-text("Save")').click();
  await settle(p);
  const x = await db(p);
  s = x.stays.find(y => y.id === bk1.id);
  ok(
    x.workers.find(y => y.id === w.id).phone === '07700 900111' && s.notes === 'Late ferry, arrives 11pm',
    'extra (Quick, desktop): phone saved on the worker, notes on the booking',
  );
  ok(
    (await q.innerText()).includes('Late ferry') && (await q.innerText()).includes('07700 900111'),
    'extra card shows the phone and notes',
  );
  // swap person: a brand-new name (RJ McLeod's crew: added to their workers list)
  await q.locator('.s-act:has-text("Swap person")').click();
  await q.locator('input[aria-label="Name"]').fill('Hamish New');
  await q.locator('input[aria-label="Name"]').press('Enter');
  await settle(p);
  const y = await db(p);
  const hw = y.workers.find(z => z.name === 'Hamish New');
  ok(!!hw && y.stays.find(z => z.id === bk1.id).workerId === hw.id, 'extra: swap person to a new name');
  await q.locator('.s-act:has-text("Swap person")').click();
  await q.locator('.s-pick.tbc').click();
  await settle(p);
  ok(!(await db(p)).stays.find(z => z.id === bk1.id).workerId, 'extra: back to "Name to follow"');
}
await p.keyboard.press('Escape');
await settle(p);
// filter to the extras only
await p.selectOption('select[aria-label="Property filter"]', 'extras');
await settle(p);
ok(
  (await p.locator('.xrow').count()) === 4 && !(await p.locator('.row:not(.xrow)').count()),
  'board filter: extras only',
);

// ---------- Eshcol books an extra directly; it stays private ----------
p = await pg(1440, 950, 'available/p-pod2', { mode: 'classic' });
ok(await p.locator('.pp-head h1:has-text("Uig")').isVisible(), 'property page for an extra');
{
  const bk = p.locator('a.pp-book');
  ok(
    (await bk.count()) === 1 &&
      (await bk.getAttribute('target')) === '_blank' &&
      /^https:\/\/booking-directly\.com\/widgets\/[^?]+\/properties$/.test(await bk.getAttribute('href')),
    'extra: "Check availability" opens the public booking page in a new tab',
  );
  ok(
    (await p.locator('.price-box').innerText()).includes('whole property, 1 room charged = £350 a week'),
    'Uig: indicative whole-property price on the property page',
  );
}
await pickFree(p, '[data-unit="x-pod2"]', 2);
ok(!(await p.locator('[data-unit="x-pod2"] .av-who').count()), 'in the app the dates go on to the booking flow');
await p.click('[data-unit="x-pod2"] .av-go');
await settle(p);
ok(
  (await p.locator('aside.panel .xtag').isVisible()) &&
    /Indicative £\d+ for 2 nights/.test(await p.locator('aside.panel [data-price="p-pod2"]').innerText()) &&
    !(await p.locator('aside.panel #f-room').count()) &&
    (await p.locator('aside.panel #f-notes').isVisible()),
  'Classic: an extra opens the stay form (badge, indicative price, notes; no room choice)',
);
await whoNext(p, { name: 'Mrs Visitor' });
{
  const x = await db(p);
  const s2 = x.stays.find(s => s.roomId === 'x-pod2' && s.holdLabel === 'Mrs Visitor');
  ok(s2 && s2.bookedBy === 'u-eshcol', 'Eshcol books an extra directly');
  ok(
    !x.alerts.some(a => a.toUserId === 'u-client' && a.body.includes('Mrs Visitor')),
    "Eshcol's guest: no alert to RJ McLeod",
  );
  ok(
    x.activity.filter(a => a.text.includes('Mrs Visitor')).every(a => a.managerOnly),
    "Eshcol's guest: log is Eshcol-only",
  );
}
// back to Quick (the default) for the board's in-place booking
await p.evaluate(() => localStorage.setItem('rb-ui-mode', 'quick'));
await p.goto(U + '#board');
await p.reload();
await settle(p);
await p.click('.seg button:has-text("6 wks")');
await settle(p);
ok(
  (await p.locator('[data-extra="p-cottage"] .xbar:has-text("Direct guest")').count()) === 1,
  'board: Eshcol sees their own guests by name',
);
ok(
  (await p.locator('[data-extra="p-monadh"] .xblock.elsewhere:has-text("Booked elsewhere")').count()) >= 1,
  'board: Eshcol sees "Booked elsewhere"',
);
await shot(p, '3c-board-eshcol');
// a free day on an extras row starts a booking with that night (up to a week) already picked
{
  const x = await db(p);
  const busy = d =>
    x.stays.some(s => s.roomId === 'x-pod1' && s.arrival <= d && (s.departure ?? '9') > d) ||
    x.blocks.some(b => b.roomId === 'x-pod1' && b.from <= d && b.to > d);
  let k = 1;
  while (busy(D(k))) k++;
  const W = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.track')).backgroundSize));
  const tl = await p.evaluate(() => parseFloat(document.querySelector('.todayline').style.left));
  const todayIdx = Math.round((tl - W / 2) / W);
  await p.locator('[data-extra="p-pod1"]').scrollIntoViewIfNeeded();
  const tr = await p.locator('[data-extra="p-pod1"] .track').boundingBox();
  await p.mouse.click(tr.x + (todayIdx + k) * W + W / 2, tr.y + tr.height / 2);
  await settle(p);
  const sh = p.locator('[data-sheet="p-pod1"]');
  ok(
    (await p.evaluate(() => location.hash)) === '#board' &&
      (await sh.isVisible()) &&
      (await sh.locator('.av-d.sel').count()) >= 1 &&
      (await sh.locator('.av-go').isVisible()),
    'board: a free day on Harris opens a booking sheet in place, that night picked (' + D(k) + ')',
  );
  ok(
    /Indicative £\d+ for \d+ night/.test(await sh.locator('.av-est').innerText()),
    'in-place sheet shows the estimate',
  );
  await shot(p, '3d-board-sheet');
  // adjust the range with the stepper
  const nOf = async () => +(/(\d+) night/.exec(await sh.locator('.av-sum').innerText()) ?? [0, 0])[1];
  const n0 = await nOf();
  await sh.locator('button[aria-label="One night fewer"]').click();
  ok((await nOf()) === n0 - 1, 'in-place sheet: − shortens the stay by a night (' + n0 + ' → ' + (n0 - 1) + ')');
  await sh.locator('button[aria-label="One night more"]').click();
  ok((await nOf()) === n0, 'in-place sheet: + lengthens it again');
  await sh.locator('.av-go').click();
  await settle(p);
  const q = p.locator('.q-panel');
  ok(
    !(await p.locator('.xs').count()) &&
      (await q.locator('.s-pick.tbc').isVisible()) &&
      !(await q.locator('.s-pick.crew').count()),
    'in-place sheet: "Book these dates" goes on to "Who is staying?" (workers list, new name, name to follow; no crew)',
  );
  await whoNext(p, { name: 'Board Sheet Test' });
  let x0 = await db(p);
  const made = x0.stays.find(s => s.holdLabel === 'Board Sheet Test');
  ok(
    !!made && made.roomId === 'x-pod1' && made.arrival === D(k) && (await p.evaluate(() => location.hash)) === '#board',
    'in-place sheet: Harris booked without leaving the board',
  );
  ok(
    !x0.workers.some(w => w.name === 'Board Sheet Test'),
    "Eshcol's own extra guest is not added to the shared workers list",
  );
  ok(
    (await q.innerText()).includes('Harris') &&
      (await q.innerText()).includes('booked!') &&
      /Indicative £\d+/.test(await q.locator('[data-price="booking"]').innerText()),
    'Booked! step with the indicative price',
  );
  await q.locator('.s-extra:has-text("Phone number")').click();
  await q.locator('input[aria-label="Phone number"]').fill('07700 900222');
  await q.locator('button[type=submit]:has-text("Save")').click();
  await settle(p);
  await q.locator('.s-extra:has-text("Notes")').click();
  await q.locator('textarea[aria-label="Notes"]').fill('Key in the lockbox');
  await q.locator('button[type=submit]:has-text("Save")').click();
  await settle(p);
  x0 = await db(p);
  ok(
    /Phone: 07700 900222/.test(x0.stays.find(s => s.id === made.id).notes) &&
      /Key in the lockbox/.test(x0.stays.find(s => s.id === made.id).notes),
    'at creation: phone and notes added to the extra booking',
  );
  await q.locator('.s-btn:has-text("Done")').click();
  await settle(p);
  ok(
    !(await p.locator('.xs').count()) &&
      (await p.locator('[data-extra="p-pod1"] [data-stay="' + made?.id + '"]').count()) === 1,
    'Done closes it and the new booking is on the board',
  );
  // Esc closes too
  const tr2 = await p.locator('[data-extra="p-pod2"] .track').boundingBox();
  await p.mouse.click(Math.min(tr2.x + tr2.width, 1440) - 30, tr2.y + tr2.height / 2);
  await settle(p);
  const opened = await p.locator('.xs').count();
  await p.keyboard.press('Escape');
  await settle(p);
  ok(opened === 1 && !(await p.locator('.xs').count()), 'in-place sheet: Esc closes it');
}
await as(p, 'u-client');
await p.goto(U + '#activity');
await settle(p);
{
  const t = await p.locator('body').innerText();
  ok(!t.includes('Mrs Visitor') && !t.includes('Direct guest'), "RJ McLeod's activity: none of Eshcol's extra guests");
  ok(!/SuperControl|Airbnb/.test(t), "RJ McLeod's activity: no booking-site names");
}

// ---------- Eshcol's rate setting ----------
p = await pg(1440, 950, 'available');
ok(await p.locator('.pp-rate').isVisible(), 'Eshcol: indicative rate setting on Properties');
await p.fill('.pp-rate input', '400');
await p.click('.pp-rate button:has-text("Save")');
await settle(p);
ok((await db(p)).settings.ratePerRoomWeek === 400, 'Eshcol: rate saved');
ok(
  (await p.locator('[data-prop="p-es"] .pp-price').innerText()) === 'Included in your contract' &&
    (await p.locator('[data-prop="p-monadh"] .pp-price').innerText()).includes('2 rooms charged = £800 a week') &&
    (await p.locator('[data-prop="p-cottage"] .pp-price').innerText()).includes('2 rooms charged = £800 a week'),
  'prices follow the rate on every extra; Eshcol stays "Included in your contract"',
);
await p.click('.pp-hist summary');
await settle(p);
{
  const h = await p.locator('.pp-hist').innerText();
  ok(
    h.includes('Rate history (1)') && /£350\s*→\s*£400/.test(h) && h.includes('Eshcol'),
    'Eshcol: rate history shows who, when, old → new',
  );
}
await shot(p, '5b-rate');
await as(p, 'u-client');
ok(!(await p.locator('.pp-rate').count()), 'RJ McLeod: cannot edit the rate');
ok(
  (await p.locator('.pp-price-note').innerText()).includes('£400 per room per week') &&
    /Long-term deals possible/.test(await p.locator('.pp-price-note').innerText()),
  'RJ McLeod: sees the indicative rate and that long-term deals are possible',
);

// ---------- property pages ----------
p = await pg(1440, 950, 'available/p-es', { user: 'u-client' });
ok(await p.locator('.pp-main').isVisible(), 'Eshcol: photo gallery');
ok((await p.locator('.pp-room').count()) === 10, 'Eshcol: 10 rooms listed');
ok(
  (await p.locator('.pp-bath.b-shared').count()) === 2 && (await p.locator('.pp-bath.b-private').count()) === 2,
  'Eshcol: rooms 8-9 shared, 1 and 5 private shower rooms',
);
ok((await p.locator('.pp-room img.pp-cover').count()) >= 10, 'Eshcol: a cover photo on every room card');
// tap to enlarge, then move through the photos
await p.click('.pp-mainbtn');
await settle(p);
ok(await p.locator('.lb').isVisible(), 'gallery: tap the photo to enlarge');
const c1 = await p.locator('.lb-top').innerText();
await p.keyboard.press('ArrowRight');
ok(
  (await p.locator('.lb-top').innerText()) !== c1 && /2 of/.test(await p.locator('.lb-top').innerText()),
  'viewer: arrow key moves to the next photo',
);
await shot(p, '4b-lightbox');
await p.keyboard.press('Escape');
await settle(p);
ok(!(await p.locator('.lb').count()), 'viewer: Esc closes');
ok(cleanerFree(await pageText(p)), 'privacy: no cleaner name on the property page');
ok(!(await p.locator('.pp-todo').count()), 'Eshcol: nothing left "to come" (address confirmed, bed sizes not needed)');
await shot(p, '4-property-eshcol');
await p.goto(U + '#available/p-lr');
await settle(p);
ok(await p.locator('.pp-main').isVisible(), 'Loch Roag: photo gallery');
ok(!(await p.locator('a.pp-book').count()), 'Loch Roag: no booking-page button on a contract house');
{
  const x = await db(p);
  const n = x.rooms.filter(r => r.propertyId === 'p-lr').reduce((t, r) => t + (r.photos?.length ?? 0), 0);
  ok(
    n === 16 && (await p.locator('.pp-room img.pp-cover').count()) === 8,
    'Loch Roag: 16 room photos, one cover on rooms 1-3, 5-9',
  );
  const box = await p.locator('#room-lr-3 .pp-coverbtn').boundingBox();
  await p.click('#room-lr-3 .pp-coverbtn');
  await settle(p);
  ok(/1 of 3/.test(await p.locator('.lb-top').innerText()), 'Loch Roag Room 3: tap the cover to see its 3 photos');
  await p.click('.lb-nav.next');
  ok(/2 of 3/.test(await p.locator('.lb-top').innerText()), 'viewer: next button');
  await p.click('.lb-x');
  await settle(p);
  ok(!(await p.locator('.lb').count()) && box.height > 100, 'viewer: ✕ closes; covers are a good size');
  const sizes = await p
    .locator('.pp-room .pp-cover')
    .evaluateAll(es => [...new Set(es.map(e => Math.round(e.getBoundingClientRect().height)))]);
  ok(sizes.length === 1, 'Loch Roag: every room cover is the same size, placeholder included (' + sizes + ')');
}
ok(
  (await p.locator('#room-lr-4 .pp-nophoto').count()) === 1 && (await p.locator('#room-lr-4 img').count()) === 0,
  'Loch Roag: Room 4 shows "Photo to come"',
);
ok((await p.locator('.pp-todo').innerText()).includes('Room 4'), 'Loch Roag: Room 4 photos marked "details to come"');
{
  const t = await p.locator('body').innerText();
  ok(!/bed size/i.test(t), 'Loch Roag: no bed-size placeholders');
  const bad = await p.evaluate(
    () => [...document.querySelectorAll('.pp-detail img')].filter(i => i.complete && i.naturalWidth === 0).length,
  );
  ok(bad === 0, 'Loch Roag: every photo loads');
}
ok(
  (await p.locator('.pp-room').count()) === 9 && (await p.locator('.pp-bath.b-shared').count()) === 2,
  'Loch Roag: 9 rooms, 2 and 3 share',
);
await p.goto(U + '#available');
await settle(p);
ok(
  JSON.stringify(await p.locator('[data-prop]').evaluateAll(cs => cs.map(c => c.dataset.prop))) ===
    JSON.stringify(['p-es', 'p-lr', 'p-pod1', 'p-pod2', 'p-monadh', 'p-cottage']),
  'Properties list: Eshcol, Loch Roag, Harris, Uig, Monadh, Abhainn Cottage',
);
ok((await p.locator('[data-prop] .pp-price').count()) === 6, 'Properties list: indicative price on every card');
ok(!(await p.locator('.pp-cal').count()), 'RJ McLeod: no calendar-link settings or enquiry list');
await shot(p, '5-properties-list');

// ---------- Eshcol: calendar links (demo) ----------
p = await pg(1440, 950, 'available/p-cottage');
await p.click('.pp-cal summary');
await settle(p);
ok(
  (await p.locator('.pp-feed').innerText()).includes('Calendar not linked yet') &&
    !(await p.locator('.pp-cal input').count()),
  'Eshcol: Abhainn Cottage calendar "not linked yet", no link box to paste into',
);
await p.goto(U + '#available/p-monadh');
await settle(p);
await p.click('.pp-cal summary');
await settle(p);
{
  const t = await p.locator('.pp-cal').innerText();
  ok(
    t.includes('Calendar linked') && t.includes('SuperControl') && !/https?:|\.ics\b/.test(t.replace('(.ics)', '')),
    'Eshcol: Monadh calendar linked, link never shown',
  );
}
await p.click('.pp-cal button:has-text("Read calendars now")');
await settle(p);
ok(!errs.length, 'no console errors so far');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.pp-cal button:has-text("Download")')]);
ok(/\.ics$/.test(dl.suggestedFilename()), 'Eshcol: export downloads an .ics');
await shot(p, '6-calendar-links');

// ---------- phone: property page ----------
p = await pg(390, 844, 'available/p-cottage', { user: 'u-client' });
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 392, 'phone: property page fits the width (' + sw + ')');
ok((await p.locator('.av-d').first().boundingBox()).height >= 44, 'phone: day cells are big enough to tap');
// phone main view: the extras are on Rooms too
await p.goto(U + '#rooms');
await settle(p);
ok(
  JSON.stringify(await p.locator('.xcard').evaluateAll(cs => cs.map(c => c.dataset.extra))) ===
    JSON.stringify(['p-pod1', 'p-pod2', 'p-monadh', 'p-cottage']),
  'phone Rooms: the 4 extras, in order',
);
ok(
  (await p.locator('.xcard .x14').count()) === 4 &&
    (await p.locator('.xcard .xbtns :is(a,button):has-text("Book")').count()) === 4,
  'phone Rooms: next 14 nights and a Book button on each',
);
ok(!(await p.locator('.xsec').innerText()).includes('Direct guest'), "phone Rooms: no names of Eshcol's guests");
ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 392, 'phone Rooms: fits the width');
await p.locator('.xsec').scrollIntoViewIfNeeded();
await shot(p, '7-rooms-extras-phone');
ok(
  (await p.locator('.xcard .xd').first().boundingBox()).height >= 44,
  'phone Rooms: night cells are big enough to tap',
);
{
  const cell = p.locator('.xcard[data-extra="p-pod2"] button.xd.f').first();
  const h0 = await p.evaluate(() => location.hash);
  await cell.click();
  await settle(p);
  const sh = p.locator('[data-sheet="p-pod2"]');
  const bx = await sh.boundingBox();
  ok(
    (await p.evaluate(() => location.hash)) === h0 &&
      (await sh.isVisible()) &&
      (await sh.locator('.av-d.sel').count()) >= 1 &&
      (await sh.locator('.av-go').isVisible()) &&
      bx.width <= 391,
    'phone: tapping a free night on Rooms opens a booking sheet in place, that night picked',
  );
  // the first picked night is in view above the booking bar
  const sel = await sh.locator('.av-d.sel').first().boundingBox();
  const bar = await sh.locator('.av-bar').boundingBox();
  ok(
    sel.y + sel.height <= bar.y + 1 && sel.y >= bx.y,
    'phone sheet: the picked night is visible above the booking bar',
  );
  await shot(p, '8-sheet-phone');
  await sh.locator('.av-go').click();
  await whoNext(p, { worker: 'Fraser Munro' });
  const fr = (await db(p)).workers.find(w => w.name === 'Fraser Munro');
  const mk = (await db(p)).stays.find(s => s.roomId === 'x-pod2' && s.workerId === fr.id);
  ok(
    !!mk &&
      (await p.evaluate(() => location.hash)) === h0 &&
      (await p.locator('.q-panel').innerText()).includes('booked!'),
    'phone: booked in place with a worker picked from the list',
  );
  {
    const q = p.locator('.q-panel');
    await q.locator('.s-extra:has-text("Notes")').click();
    await q.locator('textarea[aria-label="Notes"]').fill('Phone booking note');
    await q.locator('button[type=submit]:has-text("Save")').click();
    await settle(p);
    ok(
      (await db(p)).stays.find(s => s.id === mk.id).notes === 'Phone booking note' &&
        (await p.evaluate(() => document.documentElement.scrollWidth)) <= 392,
      'phone: notes added at creation, fits the width',
    );
    await q.locator('.s-btn:has-text("Done")').click();
    await settle(p);
  }
  ok(!(await p.locator('.xs').count()) && !(await p.locator('.q-panel').count()), 'phone sheet: Done closes it');
}
// phone: swipe the gallery and the viewer
await p.goto(U + '#available/p-lr');
await settle(p);
{
  await p.locator('.pp-stage').scrollIntoViewIfNeeded();
  const bb = await p.locator('.pp-stage').boundingBox();
  const y = bb.y + bb.height / 2;
  await p.mouse.move(bb.x + bb.width - 90, y);
  await p.mouse.down();
  await p.mouse.move(bb.x + 90, y, { steps: 5 });
  await p.mouse.up();
  await settle(p);
  ok(
    /^2 \//.test(await p.locator('.pp-count').innerText()) && !(await p.locator('.lb').count()),
    'phone: swipe moves the gallery (and does not open the viewer)',
  );
  await p.click('#room-lr-2 .pp-coverbtn');
  await settle(p);
  const vb = { w: 390, h: 844 };
  await p.mouse.move(vb.w - 60, vb.h / 2);
  await p.mouse.down();
  await p.mouse.move(60, vb.h / 2, { steps: 5 });
  await p.mouse.up();
  await settle(p);
  ok(
    /2 of 2/.test(await p.locator('.lb-top').innerText()) && (await p.locator('.lb').isVisible()),
    'phone viewer: swipe to the next photo, stays open',
  );
  await shot(p, '9-lightbox-phone');
  await p.click('.lb-x');
}

// ---------- open-ended (until further notice) booking of an extra, end date set later ----------
p = await pg(1440, 950, 'available/p-pod2', { user: 'u-client' });
{
  const x = await db(p);
  const ss = x.stays.filter(s => s.roomId === 'x-pod2');
  const bs = (x.blocks ?? []).filter(b => b.roomId === 'x-pod2');
  let first = D(3);
  for (const s of ss) if ((s.departure ?? '9999') > first) first = s.departure ?? '9999';
  for (const b of bs) if (b.to > first) first = b.to;
  const u = '[data-unit="x-pod2"]';
  await p.locator(`${u} .av-d[data-d="${first}"]`).click();
  await p.locator(`${u} .av-mode button:has-text("Open-ended")`).click();
  await settle(p);
  ok(
    /per week, until further notice/.test(await p.locator(`${u} .av-est`).innerText()) &&
      /until further notice/.test(await p.locator(`${u} .av-sum`).innerText()),
    'open-ended: weekly indicative price, "until further notice" (from ' + first + ')',
  );
  ok((await p.locator(`${u} .av-d.sel`).count()) > 20, 'open-ended: every later night is shown as part of the booking');
  await shot(p, '10-open-ended');
  await p.locator(`${u} .av-go:has-text("Book open-ended")`).click();
  await whoNext(p);
  await p.locator('.q-panel .s-btn:has-text("Done")').click();
  await settle(p);
  const st = (await db(p)).stays.find(s => s.roomId === 'x-pod2' && s.arrival === first);
  ok(
    !!st && st.departure === null && st.depStatus === 'ufn' && st.bookedBy === 'u-client',
    'open-ended: saved with no end date, booked by RJ McLeod',
  );
  ok(
    (await p.locator(`${u} .av-d[data-d="${D(55)}"]`).getAttribute('class')).includes('s-mine') &&
      (await p.locator(`${u} .av-yours`).innerText()).includes('until further notice'),
    'open-ended: availability blocks every night going forward (shown as "Yours")',
  );
  // the Rooms card / board show it, and Eshcol's iCal export blocks it
  await p.goto(U + '#board');
  await settle(p);
  ok((await p.locator(`[data-extra="p-pod2"] [data-stay="${st?.id}"]`).count()) === 1, 'open-ended: on the board');
  // set the end date later from the booking card
  await p.goto(U + '#rooms');
  await settle(p);
  await p.locator('.xcard[data-extra="p-pod2"] .xbtns .btn.ghost').click();
  await settle(p);
  const endIn = p.locator(`[data-end="${st?.id}"] input[id^="end-"]`);
  ok(await endIn.isVisible(), 'open-ended: the booking card offers "set an end date"');
  const endD = new Date(Date.parse(first + 'T00:00Z') + 21 * 864e5).toISOString().slice(0, 10);
  await endIn.fill(endD.split('-').reverse().join('/'));
  await p.locator(`[data-end="${st?.id}"] button:has-text("Save end date")`).click();
  await settle(p);
  const st2 = (await db(p)).stays.find(s => s.id === st?.id);
  ok(st2 && st2.departure === endD && st2.depStatus === 'planned', 'open-ended: end date set later (' + endD + ')');
  await p.goto(U + '#available/p-pod2');
  await settle(p);
  ok(
    !(await p.locator(`${u} .av-d[data-d="${D(55)}"]`).getAttribute('class')).includes('s-mine'),
    'open-ended: nights after the new end date are free again',
  );
}
// open-ended is refused where a later night is taken (Monadh has calendar blocks)
p = await pg(1440, 950, 'available/p-monadh', { user: 'u-client' });
{
  const x = await db(p);
  const bs = (x.blocks ?? []).filter(b => b.roomId === 'x-monadh').sort((a, b) => (a.from < b.from ? -1 : 1));
  const later = bs.find(b => b.from > D(4));
  const free = await p
    .locator('[data-unit="x-monadh"] .av-d.s-free:not([disabled])')
    .evaluateAll((els, lim) => els.map(e => e.dataset.d).filter(d => d < lim), later?.from ?? '0');
  await p.locator(`[data-unit="x-monadh"] .av-d[data-d="${free[0]}"]`).click();
  await p.locator('[data-unit="x-monadh"] .av-mode button:has-text("Open-ended")').click();
  await settle(p);
  const t = await p.locator('[data-unit="x-monadh"] .av-bar').innerText();
  ok(
    !!later && /Open-ended needs every night/.test(t) && !(await p.locator('[data-unit="x-monadh"] .av-go').count()),
    'open-ended: refused when a later night is already taken, with the date it clashes',
  );
  ok(!/SuperControl/.test(t), 'open-ended clash message names no booking site');
}

// ---------- photo viewer zoom ----------
p = await pg(1440, 950, 'available/p-lr');
{
  await p.locator('.pp-mainbtn').click();
  await settle(p);
  const pct = async () => parseInt(await p.locator('.lb-pct').innerText());
  const ib = await p.locator('.lb-img').boundingBox();
  const cx = ib.x + ib.width / 2,
    cy = ib.y + ib.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.wheel(0, -200);
  await settle(p);
  const w1 = await pct();
  ok(w1 > 100, 'viewer: mouse wheel zooms in (' + w1 + '%)');
  for (let k = 0; k < 6 && (await p.locator('button[aria-label="Zoom out"]').isEnabled()); k++)
    await p.locator('button[aria-label="Zoom out"]').click();
  await settle(p);
  ok((await pct()) === 100, 'viewer: zoom-out button back to 100%');
  await p.mouse.click(cx + 80, cy - 40);
  await settle(p);
  ok((await pct()) === 250, 'viewer: click on the photo zooms to 250%');
  await shot(p, '11-zoom-desk');
  // drag to pan while zoomed: the photo moves but never comes past the screen middle
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.move(cx + 3000, cy, { steps: 6 });
  await p.mouse.up();
  await settle(p);
  const pb = await p.locator('.lb-img').boundingBox();
  ok(
    pb.x <= 720 && (await p.locator('.lb').isVisible()) && (await pct()) === 250,
    'viewer: drag pans the zoomed photo, kept in bounds',
  );
  await p.mouse.click(cx, cy);
  await settle(p);
  ok((await pct()) === 100 && (await p.locator('.lb').isVisible()), 'viewer: click again resets, viewer stays open');
  await p.keyboard.press('+');
  ok((await pct()) === 150, 'viewer: + key zooms');
  await p.keyboard.press('Escape');
}
p = await pg(390, 844, 'available/p-lr', { user: 'u-client' });
{
  await p.locator('.pp-mainbtn').click();
  await settle(p);
  const pct = async () => parseInt(await p.locator('.lb-pct').innerText());
  const touch = (type, id, x, y) =>
    p.locator('.lb-img').dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
  const ib = await p.locator('.lb-img').boundingBox();
  const cx = ib.x + ib.width / 2,
    cy = ib.y + ib.height / 2;
  // pinch: two fingers spread from 100px apart to 260px apart
  await touch('pointerdown', 1, cx - 50, cy);
  await touch('pointerdown', 2, cx + 50, cy);
  for (const k of [1, 2, 3, 4]) {
    await touch('pointermove', 1, cx - 50 - 20 * k, cy);
    await touch('pointermove', 2, cx + 50 + 20 * k, cy);
  }
  await touch('pointerup', 2, cx + 130, cy);
  await touch('pointerup', 1, cx - 130, cy);
  await settle(p);
  const z1 = await pct();
  ok(z1 >= 220 && z1 <= 300, 'phone viewer: pinch zooms (' + z1 + '%)');
  await shot(p, '12-pinch-phone');
  // pinch back in
  await touch('pointerdown', 1, cx - 130, cy);
  await touch('pointerdown', 2, cx + 130, cy);
  await touch('pointermove', 1, cx - 20, cy);
  await touch('pointermove', 2, cx + 20, cy);
  await touch('pointerup', 2, cx + 20, cy);
  await touch('pointerup', 1, cx - 20, cy);
  await settle(p);
  ok((await pct()) === 100, 'phone viewer: pinch in goes back to 100%');
  // double-tap toggles 250%
  for (const _ of [1, 2]) {
    await touch('pointerdown', 1, cx, cy);
    await touch('pointerup', 1, cx, cy);
  }
  await settle(p);
  ok((await pct()) === 250, 'phone viewer: double-tap zooms in');
  for (const _ of [1, 2]) {
    await touch('pointerdown', 1, cx, cy);
    await touch('pointerup', 1, cx, cy);
  }
  await settle(p);
  ok((await pct()) === 100 && (await p.locator('.lb').isVisible()), 'phone viewer: double-tap again resets');
  // at 100% a swipe still changes photo
  await touch('pointerdown', 1, cx + 120, cy);
  await touch('pointermove', 1, cx - 120, cy);
  await touch('pointerup', 1, cx - 120, cy);
  await settle(p);
  ok(/2 of/.test(await p.locator('.lb-top').innerText()), 'phone viewer: swipe still changes photo when not zoomed');
}

// ---------- block contract (Eshcol, Loch Roag): no £ anywhere, any role, desktop and phone ----------
{
  // all visible text plus tooltips and labels inside the given scopes
  // the extras (Harris, Uig, Monadh, Abhainn) are priced on purpose: they are left out of the look
  const EXTRA =
    '[data-extra], [data-extras], .xfree, .xgroup, .xsec, .xcard, .xrow, .xs, .avp, [data-prop^="p-pod"], [data-prop="p-monadh"], [data-prop="p-cottage"], .pp-price-note, .pp-rate, .pp-hist';
  const money = (p, sel) =>
    p.evaluate(
      ({ sel, EXTRA }) => {
        const out = [];
        const hidden = [...document.querySelectorAll(EXTRA)].map(e => [e, e.style.display]);
        for (const [e] of hidden) e.style.display = 'none';
        for (const el of document.querySelectorAll(sel)) {
          if (el.closest(EXTRA)) continue;
          out.push(...el.innerText.split('\n'));
          for (const x of [el, ...el.querySelectorAll('*')])
            if (!x.closest(EXTRA))
              for (const a of ['title', 'aria-label', 'data-tip']) if (x.getAttribute(a)) out.push(x.getAttribute(a));
        }
        for (const [e, d] of hidden) e.style.display = d;
        return {
          n: document.querySelectorAll(sel).length,
          hits: out.filter(t => /£|indicative|estimate/i.test(t)).slice(0, 3),
        };
      },
      { sel, EXTRA },
    );
  const VIEWS = [
    ['available/p-es', '.page'],
    ['available/p-lr', '.page'],
    ['available', '[data-prop="p-es"], [data-prop="p-lr"], .pp-h2:first-of-type'],
    ['board', '.row[data-room^="es-"], .row[data-room^="lr-"]'],
    ['rooms', '.rcard:not(.xcard)'],
    ['today', '.page'],
    ['changeovers', '.page'],
    ['free', '.page'],
    ['workers', '.page'],
    ['crew', '.page'],
    ['print-today', 'body'],
    ['print-cleaning', 'body'],
    ['simple', 'body'],
  ];
  for (const [w, h, sz] of [
    [1440, 950, 'desktop'],
    [390, 844, 'phone'],
  ])
    for (const user of ['u-eshcol', 'u-client', 'u-housekeeper']) {
      const p = await pg(w, h, 'board', { user });
      const who = { 'u-eshcol': 'Eshcol', 'u-client': 'RJ McLeod', 'u-housekeeper': 'cleaner' }[user];
      const bad = [];
      let seen = 0;
      for (const [hash, sel] of VIEWS) {
        await p.goto(U + '#' + hash);
        await settle(p);
        const r = await money(p, sel);
        seen += r.n;
        if (r.hits.length) bad.push(`#${hash}: ${r.hits.join(' / ').slice(0, 120)}`);
        // the housekeeper sees no prices at all (20 Oct), extras included
        if (user === 'u-housekeeper' && (await p.locator('.xfree').count()))
          if (/£|indicative|estimate/i.test(await p.locator('.xfree').innerText()))
            bad.push('#free: price shown to housekeeper');
        // Find a room lists the extras too (19 Oct), priced on purpose, outside the contract
        if (
          hash === 'free' &&
          user !== 'u-housekeeper' &&
          !/Indicative only/.test(await p.locator('.xfree-note').innerText())
        )
          bad.push('#free: extras shown without their indicative price note');
      }
      // activity: lines about contract rooms
      await p.goto(U + '#activity');
      await settle(p);
      const act = await p.locator('body').innerText();
      const actBad = act.split('\n').filter(l => /Eshcol|Loch Roag/.test(l) && /£/.test(l));
      if (actBad.length) bad.push('#activity: ' + actBad[0]);
      // a contract booking's card (Quick on the board / Rooms) and the Classic panel
      if (user !== 'u-housekeeper') {
        for (const mode of ['quick', 'classic']) {
          await p.evaluate(m => localStorage.setItem('rb-ui-mode', m), mode);
          await p.goto(U + (w > 500 ? '#board' : '#rooms'));
          await p.reload();
          await settle(p);
          if (w > 500) await p.locator('.row[data-room="es-3"] .bar, .row[data-room="lr-1"] .bar').first().click();
          else {
            await p.locator('.rcard[data-room="lr-1"] .qup').scrollIntoViewIfNeeded();
            await p.locator('.rcard[data-room="lr-1"] .qup').click();
          }
          await settle(p);
          const r = await money(p, '.q-panel, .panel');
          seen += r.n;
          if (!r.n) bad.push(`${mode}: no booking card opened`);
          if (r.hits.length) bad.push(`${mode} booking card: ${r.hits.join(' / ')}`);
          await p.keyboard.press('Escape');
        }
        await p.evaluate(() => localStorage.setItem('rb-ui-mode', 'quick'));
      }
      ok(
        !bad.length && seen > (user === 'u-housekeeper' ? 4 : 10),
        `${sz} ${who}: no £, price or estimate on any Eshcol / Loch Roag view (${seen} areas) ${bad.join(' | ')}`,
      );
      if (user === 'u-client') {
        await p.goto(U + '#available/p-es');
        await settle(p);
        ok(
          (await p.locator('[data-price="contract"]').innerText()).includes('Included in your contract') &&
            !(await p.locator('.pp-rate').count()),
          `${sz} RJ McLeod: Eshcol says "Included in your contract", no money`,
        );
        await p.goto(U + '#available/p-monadh');
        await settle(p);
        ok(
          /£700 a week/.test(await p.locator('[data-price="p-monadh"]').innerText()),
          `${sz} RJ McLeod: extras still priced (Monadh £700 a week)`,
        );
      }
      await p.close();
    }
}

console.log(errs.length ? 'Console errors:\n' + errs.join('\n') : 'No console errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
