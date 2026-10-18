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
async function pg(w, h, hash, { user = 'u-donald', mode = null } = {}) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#' + hash);
  await p.evaluate(
    ({ m }) => {
      localStorage.clear();
      for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
      if (m) localStorage.setItem('rb-ui-mode', m);
    },
    { m: mode },
  );
  await p.reload();
  await settle(p);
  if (user !== 'u-donald') await as(p, user);
  return p;
}
// switch person on either header (main app .who, stand-alone page .s-who)
async function as(p, id) {
  const sel = (await p.locator('select.who').count()) ? 'select.who' : 'select.s-who';
  await p.selectOption(sel, id);
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
const names = x => x.workers.map(w => w.name).concat(x.users.filter(u => u.role === 'cleaner').map(u => u.name));

// ---------- availability page as Sheena (phone) ----------
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
  const body = await p.locator('body').innerText();
  ok(
    !names(x).some(n => body.includes(n)) && !/Mairi/.test(body),
    'privacy: no guest or cleaner names on the availability page',
  );
  ok(!/Airbnb|Booking\.com|SuperControl/.test(body), 'privacy: Sheena does not see which site a booking came from');
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
  'Sheena: picking dates shows "Book these dates" (no request step)',
);
ok(
  (await p.locator('[data-unit="x-pod1"] .av-est').innerText()).includes(
    'Indicative £150 for 3 nights (£350 a week ÷ 7 × 3)',
  ),
  'Sheena: pro-rata estimate before booking',
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
      m.includes('Donald has been notified') &&
      m.includes('£150') &&
      /long-term/.test(m),
    'confirmation: booked straight away, Donald notified, indicative £150, long-term deals possible',
  );
}
let bk1 = (await db(p)).stays.find(s => s.roomId === 'x-pod1' && s.holdLabel === 'Calum Test');
ok(bk1 && bk1.bookedBy === 'u-client' && !('request' in bk1), 'client booking of an extra is a confirmed booking');
ok((await p.locator('[data-unit="x-pod1"] .av-d.s-mine').count()) === 3, 'Sheena: her booked nights show as "Yours"');
ok(
  (await p.locator('[data-unit="x-pod1"] .av-yours').innerText()).includes('Calum Test') &&
    (await p.locator('[data-unit="x-pod1"] .av-d.s-mine').first().getAttribute('aria-label')).includes('yours'),
  'Sheena: "Your bookings here" lists it',
);
ok(!(await p.locator('[data-unit="x-cottage"] .av-d.s-mine').count()), "Donald's guest is not shown as hers");
ok(
  (await db(p)).alerts.some(a => a.toUserId === 'u-donald' && /New booking/.test(a.subject) && /£150/.test(a.body)),
  'Donald is alerted, with the indicative price',
);
// a booked-elsewhere night cannot be picked
ok(
  await p.locator('[data-unit="x-monadh"] .av-d.s-elsewhere').first().isDisabled(),
  'booked-elsewhere nights cannot be picked',
);

// ---------- the main board includes the extras (desktop), Sheena ----------
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
    JSON.stringify(['Eshcol Worker Accommodation', 'Loch Roag Guest House', 'Extra properties']),
  'board: group order Eshcol, Loch Roag, extras',
);
ok(
  (await p.locator(`[data-extra="p-pod1"] .xbar[data-stay="${bk1.id}"]`).count()) === 1,
  'board: Sheena sees her own extra booking',
);
{
  const row = await p.locator('[data-extra="p-cottage"]').innerText();
  ok(
    (await p.locator('[data-extra="p-cottage"] .xblock').count()) >= 1 && !row.includes('Direct guest'),
    "board: Donald's own guest shows to Sheena as Taken, no name",
  );
  ok(
    (await p.locator('[data-extra="p-monadh"] .xblock').count()) >= 1 &&
      !(await p.locator('[data-extra="p-monadh"] .xblock.elsewhere').count()),
    'board: Monadh calendar dates show to Sheena as Taken (no site)',
  );
  ok(
    /Indicative £350 per room per week/.test(await p.locator('.xgrp').innerText()),
    'board: price note on the extras group',
  );
}
await shot(p, '3-board-sheena');
await p.click('[data-extra="p-pod1"] .xbar');
await settle(p);
{
  const t = await p.locator('.q-panel').innerText();
  ok(
    t.includes('Indicative £150 for 3 nights') && t.includes('Long-term deals possible'),
    'Quick card: indicative estimate',
  );
  ok(
    t.includes('Cancel booking') && !/Confirm|Decline/.test(t),
    'Quick card: no confirm/decline; Sheena can cancel her own',
  );
}
await shot(p, '3b-extra-card');
await p.keyboard.press('Escape');
await settle(p);
// filter to the extras only
await p.selectOption('select[aria-label="Property filter"]', 'extras');
await settle(p);
ok(
  (await p.locator('.xrow').count()) === 4 && !(await p.locator('.row:not(.xrow)').count()),
  'board filter: extras only',
);

// ---------- Donald books an extra directly; it stays private ----------
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
await p.fill('[data-unit="x-pod2"] .av-who input', 'Mrs Visitor');
await p.click('[data-unit="x-pod2"] .av-go');
await settle(p);
{
  const x = await db(p);
  const s2 = x.stays.find(s => s.roomId === 'x-pod2' && s.holdLabel === 'Mrs Visitor');
  ok(s2 && s2.bookedBy === 'u-donald', 'Donald books an extra directly');
  ok(
    !x.alerts.some(a => a.toUserId === 'u-client' && a.body.includes('Mrs Visitor')),
    "Donald's guest: no alert to Sheena",
  );
  ok(
    x.activity.filter(a => a.text.includes('Mrs Visitor')).every(a => a.managerOnly),
    "Donald's guest: log is Donald-only",
  );
}
await p.goto(U + '#board');
await settle(p);
await p.click('.seg button:has-text("6 wks")');
await settle(p);
ok(
  (await p.locator('[data-extra="p-cottage"] .xbar:has-text("Direct guest")').count()) === 1,
  'board: Donald sees his own guests by name',
);
ok(
  (await p.locator('[data-extra="p-monadh"] .xblock.elsewhere:has-text("Booked elsewhere")').count()) >= 1,
  'board: Donald sees "Booked elsewhere"',
);
await shot(p, '3c-board-donald');
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
  ok(
    (await p.evaluate(() => location.hash)) === '#available/p-pod1/' + D(k) &&
      (await p.locator('[data-unit="x-pod1"] .av-d.sel').count()) >= 1 &&
      (await p.locator('[data-unit="x-pod1"] .av-go').isVisible()),
    'board: a free day on Harris opens a booking with that night picked (' + D(k) + ')',
  );
  ok(
    /Indicative £\d+ for \d+ night/.test(await p.locator('[data-unit="x-pod1"] .av-est').innerText()),
    'prefilled booking shows the estimate',
  );
  await shot(p, '3d-board-prefill');
}
await as(p, 'u-client');
await p.goto(U + '#activity');
await settle(p);
{
  const t = await p.locator('body').innerText();
  ok(!t.includes('Mrs Visitor') && !t.includes('Direct guest'), "Sheena's activity: none of Donald's extra guests");
  ok(!/SuperControl|Airbnb/.test(t), "Sheena's activity: no booking-site names");
}

// ---------- Donald's rate setting ----------
p = await pg(1440, 950, 'available');
ok(await p.locator('.pp-rate').isVisible(), 'Donald: indicative rate setting on Properties');
await p.fill('.pp-rate input', '400');
await p.click('.pp-rate button:has-text("Save")');
await settle(p);
ok((await db(p)).settings.ratePerRoomWeek === 400, 'Donald: rate saved');
ok(
  (await p.locator('[data-prop="p-es"] .pp-price').innerText()) === 'Indicative £400 per room per week' &&
    (await p.locator('[data-prop="p-monadh"] .pp-price').innerText()).includes('2 rooms charged = £800 a week') &&
    (await p.locator('[data-prop="p-cottage"] .pp-price').innerText()).includes('2 rooms charged = £800 a week'),
  'prices follow the rate everywhere',
);
await p.click('.pp-hist summary');
await settle(p);
{
  const h = await p.locator('.pp-hist').innerText();
  ok(
    h.includes('Rate history (1)') && /£350\s*→\s*£400/.test(h) && h.includes('Donald'),
    'Donald: rate history shows who, when, old → new',
  );
}
await shot(p, '5b-rate');
await as(p, 'u-client');
ok(!(await p.locator('.pp-rate').count()), 'Sheena: cannot edit the rate');
ok(
  (await p.locator('.pp-price-note').innerText()).includes('£400 per room per week') &&
    /Long-term deals possible/.test(await p.locator('.pp-price-note').innerText()),
  'Sheena: sees the indicative rate and that long-term deals are possible',
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
ok(!/Mairi/.test(await p.locator('body').innerText()), 'privacy: no cleaner name on the property page');
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
ok(!(await p.locator('.pp-cal').count()), 'Sheena: no calendar-link settings or enquiry list');
await shot(p, '5-properties-list');

// ---------- Donald: calendar links (demo) ----------
p = await pg(1440, 950, 'available/p-cottage');
await p.click('.pp-cal summary');
await settle(p);
ok(
  (await p.locator('.pp-feed').innerText()).includes('Calendar not linked yet') &&
    !(await p.locator('.pp-cal input').count()),
  'Donald: Abhainn Cottage calendar "not linked yet", no link box to paste into',
);
await p.goto(U + '#available/p-monadh');
await settle(p);
await p.click('.pp-cal summary');
await settle(p);
{
  const t = await p.locator('.pp-cal').innerText();
  ok(
    t.includes('Calendar linked') && t.includes('SuperControl') && !/https?:|\.ics\b/.test(t.replace('(.ics)', '')),
    'Donald: Monadh calendar linked, link never shown',
  );
}
await p.click('.pp-cal button:has-text("Read calendars now")');
await settle(p);
ok(!errs.length, 'no console errors so far');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.pp-cal button:has-text("Download")')]);
ok(/\.ics$/.test(dl.suggestedFilename()), 'Donald: export downloads an .ics');
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
  (await p.locator('.xcard .x14').count()) === 4 && (await p.locator('.xcard a:has-text("Book")').count()) === 4,
  'phone Rooms: next 14 nights and a Book button on each',
);
ok(!(await p.locator('.xsec').innerText()).includes('Direct guest'), "phone Rooms: no names of Donald's guests");
ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 392, 'phone Rooms: fits the width');
await p.locator('.xsec').scrollIntoViewIfNeeded();
await shot(p, '7-rooms-extras-phone');
ok(
  (await p.locator('.xcard .xd').first().boundingBox()).height >= 44,
  'phone Rooms: night cells are big enough to tap',
);
{
  const cell = p.locator('.xcard[data-extra="p-pod2"] a.xd.f').first();
  const href = await cell.getAttribute('href');
  await cell.click();
  await settle(p);
  ok(
    (await p.evaluate(() => location.hash)) === href &&
      (await p.locator('[data-unit="x-pod2"] .av-d.sel').count()) >= 1 &&
      (await p.locator('[data-unit="x-pod2"] .av-go').isVisible()),
    'phone: tapping a free night on Rooms starts a booking from that night',
  );
  await shot(p, '8-prefill-phone');
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

console.log(errs.length ? 'Console errors:\n' + errs.join('\n') : 'No console errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
