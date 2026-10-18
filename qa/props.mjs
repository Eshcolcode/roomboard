// Properties + extra-property requests + availability page. node qa/props.mjs (preview on :4173 or QA_URL).
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
const iPick = await pickFree(p, '[data-unit="x-pod1"]', 3);
ok(
  iPick >= 0 && (await p.locator('[data-unit="x-pod1"] .av-go:has-text("Request these dates")').isVisible()),
  'Sheena: picking dates shows "Request these dates"',
);
await p.fill('[data-unit="x-pod1"] .av-who input', 'Calum Test');
await p.locator('[data-unit="x-pod1"] .av-bar').scrollIntoViewIfNeeded();
await shot(p, '2-request-phone');
await p.click('[data-unit="x-pod1"] .av-go');
await settle(p);
ok(
  (await p.locator('[data-unit="x-pod1"] .av-msg.ok').innerText()).includes('Donald will confirm'),
  'request sent message',
);
let req = (await db(p)).stays.find(s => s.roomId === 'x-pod1' && s.holdLabel === 'Calum Test');
ok(req && req.request === 'pending', 'client booking of an extra is a pending request');
ok((await p.locator('[data-unit="x-pod1"] .av-d.s-request').count()) === 3, 'requested nights show as requested');
// a booked-elsewhere night cannot be picked
ok(
  await p.locator('[data-unit="x-monadh"] .av-d.s-elsewhere').first().isDisabled(),
  'booked-elsewhere nights cannot be picked',
);

// ---------- Donald answers in the Quick card (desktop) ----------
await p.goto(U + '#rooms');
await p.reload();
await settle(p);
await as(p, 'u-donald');
ok(await p.locator('.pp-req:has-text("1 request to answer")').isVisible(), 'Donald: request banner on Rooms');
{
  const x = await db(p);
  ok(
    x.alerts?.some?.(a => /New request/.test(JSON.stringify(a))) || x.log.some(l => /request/i.test(JSON.stringify(l))),
    'Donald: alert/log for the new request',
  );
}
await p.setViewportSize({ width: 1440, height: 950 });
await settle(p);
await p.click('.pp-req button:has-text("Answer")');
await settle(p);
ok(
  (await p.locator('.q-panel button:has-text("Confirm")').isVisible()) &&
    (await p.locator('.q-panel button:has-text("Decline")').isVisible()),
  'Quick card: one-tap Confirm / Decline',
);
ok(
  (await p.locator('.q-panel').innerText()).includes('Extra · invoiced separately'),
  'Quick card: labelled extra, invoiced separately',
);
await shot(p, '3-confirm-card');
await p.click('.q-panel button:has-text("Confirm")');
await settle(p);
req = (await db(p)).stays.find(s => s.id === req.id);
ok(req && req.request == null, 'Confirm: request becomes a booking');
ok(!(await p.locator('.pp-req').count()), 'Confirm: banner gone');
ok(JSON.stringify(await db(p)).includes('Request confirmed'), 'Confirm: Sheena is told');

// ---------- decline, from Classic mode ----------
p = await pg(1440, 950, 'available/p-pod2', { user: 'u-client', mode: 'classic' });
ok(await p.locator('.pp-head h1:has-text("Uig")').isVisible(), 'property page for an extra');
{
  const bk = p.locator('a.pp-book');
  ok(
    (await bk.count()) === 1 &&
      (await bk.getAttribute('target')) === '_blank' &&
      /^https:\/\/booking-directly\.com\/widgets\/[^?]+\/properties$/.test(await bk.getAttribute('href')),
    'extra: "Check availability" opens the public booking page in a new tab',
  );
}
await pickFree(p, '[data-unit="x-pod2"]', 2);
await p.click('[data-unit="x-pod2"] .av-go');
await settle(p);
const req2 = (await db(p)).stays.find(s => s.roomId === 'x-pod2' && s.request === 'pending');
ok(!!req2, 'second request (pod 2) sent from the property page');
await as(p, 'u-donald');
await p.goto(U + '#rooms');
await settle(p);
await p.click('.pp-req button:has-text("Answer")');
await settle(p);
ok(
  (await p.locator('.q-panel').isVisible()) && !(await p.locator('.panel').count()),
  'Classic mode: requests still open in the Quick card',
);
await p.click('.q-panel button:has-text("Decline")');
await settle(p);
await p.fill('.q-panel .x-field input', 'Pod booked for maintenance');
await p.click('.q-panel button:has-text("Decline request")');
await settle(p);
{
  const x = await db(p);
  ok(!x.stays.some(s => s.id === req2.id), 'Decline: request removed');
  ok(JSON.stringify(x).includes('Pod booked for maintenance'), 'Decline: reason sent to Sheena');
}

// ---------- property pages ----------
p = await pg(1440, 950, 'available/p-es', { user: 'u-client' });
ok(await p.locator('.pp-main').isVisible(), 'Eshcol: photo gallery');
ok((await p.locator('.pp-room').count()) === 10, 'Eshcol: 10 rooms listed');
ok(
  (await p.locator('.pp-bath.b-shared').count()) === 2 && (await p.locator('.pp-bath.b-private').count()) === 2,
  'Eshcol: rooms 8-9 shared, 1 and 5 private shower rooms',
);
ok((await p.locator('.pp-room img').count()) >= 10, 'Eshcol: room photos');
ok(!/Mairi/.test(await p.locator('body').innerText()), 'privacy: no cleaner name on the property page');
ok(!(await p.locator('.pp-todo').count()), 'Eshcol: nothing left "to come" (address confirmed, bed sizes not needed)');
await shot(p, '4-property-eshcol');
await p.goto(U + '#available/p-lr');
await settle(p);
ok(await p.locator('.pp-main').isVisible(), 'Loch Roag: photo gallery');
ok(!(await p.locator('a.pp-book').count()), 'Loch Roag: no booking-page button on a contract house');
ok((await p.locator('.pp-room img').count()) === 16, 'Loch Roag: 16 room photos (rooms 1-3, 5-9)');
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
ok((await p.locator('[data-prop]').count()) === 6, 'Properties list: 2 contract houses + 4 extras');
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

console.log(errs.length ? 'Console errors:\n' + errs.join('\n') : 'No console errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
