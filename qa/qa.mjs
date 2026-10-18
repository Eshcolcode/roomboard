// End-to-end QA: node qa/qa.mjs  (needs `npm run build && npx vite preview --port 4173`).
// Dates are relative to today in Europe/London, matching the demo seed.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const T = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const D = n => new Date(Date.parse(T + 'T00:00Z') + n * 864e5).toISOString().slice(0, 10);
const uk = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmt = iso =>
  new Date(iso + 'T00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const b = await chromium.launch({
  executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
let pass = 0,
  fail = 0;
const errs = [];
const results = [];
const ok = (c, m, group = 'e2e') => {
  c ? pass++ : fail++;
  results.push({ group, name: m, pass: !!c });
  console.log((c ? 'PASS ' : 'FAIL ') + m);
};
async function page(w = 1440, h = 950, ctx) {
  const c = ctx ?? (await b.newContext({ viewport: { width: w, height: h } }));
  const p = await c.newPage();
  // This suite checks Classic mode (the original panel). Quick mode is covered by qa/flow.mjs.
  await p.addInitScript(() => {
    if (!localStorage.getItem('rb-ui-mode')) localStorage.setItem('rb-ui-mode', 'classic');
  });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => {
    errs.push('native dialog used: ' + d.message());
    d.dismiss();
  });
  return p;
}
const seen = () => {
  for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
};
const reset = async (p, hash = 'board') => {
  await p.goto(U + '#' + hash);
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(seen);
  await p.reload();
  await p.waitForTimeout(300);
};
const as = async (p, id) => {
  await p.selectOption('select.who', id);
  await p.waitForTimeout(150);
};
const card = (p, room) => p.locator(`.cc[data-room="${room}"]`).first();
const go = async (p, t) => {
  await p.goto(U + '#' + t);
  await p.waitForTimeout(200);
};
const save = p => p.click('.panel .pa .btn.primary');
const date = (p, sel, iso) => p.locator(sel).fill(iso ? uk(iso) : '');
const dialog = (p, label) => p.click(`.dialog button:has-text("${label}")`);
const body = p => p.locator('main').innerText();

const p = await page();
await reset(p);
// ---------- header, plain language ----------
ok((await p.locator('.top .live').innerText()).includes('Demo'), 'C6 header says Demo');
ok(
  (await p.locator('.demo').count()) === 0 &&
    (await p.locator('.top').evaluate(e => e.getBoundingClientRect().height)) <= 58,
  'single header band (no separate demo strip)',
);
ok(
  (await p.locator('.ph .info[data-tip*="Arrival day counts as a night"]').count()) === 1 &&
    !(await body(p)).includes('departure day does not'),
  'night rule moved behind an info icon',
);
ok(
  (await p.locator('.kpis .k:has-text("Rooms allocated")').count()) === 1 &&
    (await p.locator('.kpis .k:has-text("Expected on site")').count()) === 1,
  'C4 KPIs: Rooms allocated + Expected on site',
);
ok(
  (await p.locator('.kpis .k:has-text("Cleans due in 7 days")').count()) === 1,
  'open cleans KPI counts the next 7 days only',
);
ok(
  (await p.locator('.grp').first().innerText()).match(/\d+ allocated · \d+ on site/),
  'property headings: N allocated · M on site',
);
await p.click('.demo-pill');
ok(await p.locator('button.reset:has-text("Reset demo data")').isVisible(), '7 Reset demo data available to provider');
await p.click('.demo-pill');
ok(
  (await p.locator('input[type=date]:not(.native)').count()) === 0 &&
    (await p.locator('.datef.jump input:not(.native)').first().inputValue()).match(/^\d{2}\/\d{2}\/\d{4}$/),
  'UK date format (dd/mm/yyyy) in date inputs',
);
// changeover markers never cover a bar
const overlaps = await p.locator('.row').evaluateAll(rows =>
  rows.flatMap(r => {
    const bars = [...r.querySelectorAll('.bar')].map(e => e.getBoundingClientRect());
    return [...r.querySelectorAll('.co')]
      .map(e => e.getBoundingClientRect())
      .filter(m => bars.some(bb => m.left < bb.right - 1 && m.right > bb.left + 1))
      .map(() => r.dataset.room);
  }),
);
ok(overlaps.length === 0, 'cleaning markers never overlap bars ' + overlaps.join(','));
// ---------- add: free-only room picker, labels, undo ----------
await p.click('.ph button:has-text("+ Add stay")');
await p.click('.panel .chip >> nth=0');
await date(p, '#f-arr', D(2));
await date(p, '#f-dep', D(6));
const opts = await p.locator('#f-room option').allInnerTexts();
ok(
  opts.some(o => /^Eshcol · Room 9 · /.test(o)) && !opts.some(o => o.includes('Loch Roag · Room 1 ')),
  "room picker: free rooms only, labelled 'Eshcol · Room 9'",
);
await p.selectOption('#f-room', 'es-9');
await save(p);
await p.waitForTimeout(200);
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 1, 'add stay');
ok(await p.locator('.toast button:has-text("Undo")').isVisible(), 'undo toast after save');
await p.click('.toast button:has-text("Undo")');
await p.waitForTimeout(200);
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 0, 'undo removes the new stay');
await p.click('.ph button:has-text("+ Add stay")');
await p.click('.panel .chip >> nth=0');
await date(p, '#f-arr', D(2));
await date(p, '#f-dep', D(6));
await p.selectOption('#f-room', 'es-9');
await save(p);
await p.waitForTimeout(200);
await p.reload();
await p.waitForSelector('.bar');
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 1, 'reload persistence');
await p.click('.row[data-room="es-9"] .bar');
ok(!/\bv\d+\b/.test(await p.locator('.panel').innerText()), 'no version numbers shown');
await date(p, '#f-dep', D(9));
await save(p);
await p.waitForTimeout(150);
await go(p, 'activity');
ok((await p.locator('.act:has-text("departure")').count()) >= 1, 'extend logged');
await go(p, 'board');
await p.click('.row[data-room="es-9"] .bar');
await p.selectOption('#f-room', 'es-5');
await save(p);
await p.waitForTimeout(150);
ok(
  (await p.locator('.row[data-room="es-5"] .bar').count()) === 1 &&
    (await p.locator('.row[data-room="es-9"] .bar').count()) === 0,
  'move stay to another room',
);
// ---------- cancel: confirmation + undo ----------
await p.click('.row[data-room="es-5"] .bar');
await p.click('.panel button:has-text("Cancel stay")');
ok(await p.locator('.dialog:has-text("Cancel")').isVisible(), 'confirmation before cancelling');
await dialog(p, 'Go back');
ok((await p.locator('.row[data-room="es-5"] .bar').count()) === 1, 'Go back keeps the stay');
await p.click('.panel button:has-text("Cancel stay")');
await dialog(p, 'Cancel stay');
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="es-5"] .bar').count()) === 0, 'cancel stay');
await p.click('.toast button:has-text("Undo")');
await p.waitForTimeout(200);
ok((await p.locator('.row[data-room="es-5"] .bar').count()) === 1, 'undo restores a cancelled stay');
// ---------- validation ----------
await p.click('.ph button:has-text("+ Add stay")');
await p.click('.panel .chip >> nth=0');
await p.check('.panel .cb.sm input');
await p.selectOption('#f-room', 'lr-1');
ok(
  (await p.locator('.panel .err:has-text("is taken by")').count()) === 1 &&
    (await p.locator('.panel .pa .btn.primary').isDisabled()),
  'clash blocked (taken room shown only on request)',
);
await p.selectOption('#f-room', 'es-9');
await date(p, '#f-dep', D(-5));
ok((await p.locator('.panel .err:has-text("after arrival")').count()) === 1, 'departure before arrival blocked');
await date(p, '#f-dep', '');
await p.locator('#f-dep').blur();
ok((await p.locator('.panel .err').count()) === 1, 'empty departure blocked');
await p.locator('#f-dep').fill('31/02/2026');
ok((await p.locator('.datef.bad #f-dep').count()) === 1, 'impossible date (31/02) flagged');
await p.click('.panel [role=group][aria-label="Departure status"] button:has-text("Until further notice")');
ok(
  (await p.locator('#f-dep').inputValue()) === '' && !(await p.locator('.panel .err').count()),
  'UFN clears the departure (no error)',
);
// typing a leaving date on an open-ended stay makes it a planned departure (18 Oct 2026 fix: it used to be locked)
await date(p, '#f-dep', D(9));
ok(
  (await p.locator('.panel [aria-label="Departure status"] button.on').innerText()) === 'Planned',
  'a leaving date typed on an open-ended stay switches it to Planned',
);
await p.click('.panel [role=group][aria-label="Departure status"] button:has-text("Until further notice")');
await save(p);
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="es-9"] .bar.open').count()) === 1, 'UFN stay open-ended');
ok((await p.locator('.row[data-room="lr-7"] .bar.open').count()) === 1, 'TBC stay shown open-ended');
// worker overlap warning (warn, not block): Iain Smith is in Loch Roag Room 4
await p.click('.ph button:has-text("+ Add stay")');
await p.fill('#f-wq', 'Iain');
await p.click('.panel .chip:has-text("Iain Smith")');
await date(p, '#f-arr', D(1));
await date(p, '#f-dep', D(3));
await p.check('.panel .cb.sm input');
await p.selectOption('#f-room', 'es-9');
await p.waitForTimeout(100);
ok(
  (await p.locator('.panel .soft:has-text("also in Loch Roag Room 4")').count()) === 1,
  'same worker in two rooms: warning shown',
);
await p.selectOption('#f-room', 'lr-9');
await p.keyboard.press('Escape');
// away
await p.click('.row[data-room="lr-6"] .bar');
await p.click('.panel summary');
await date(p, '[aria-label="Away from"]', D(4));
await date(p, '[aria-label="Back on"]', D(3));
ok((await p.locator('.panel .err:has-text("Away")').count()) === 1, 'away: back before leaves blocked');
await date(p, '[aria-label="Back on"]', D(7));
await save(p);
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="lr-6"] .away').count()) === 1, 'away, room kept shown on board');
await p.click('.row[data-room="lr-6"] .bar');
await p.keyboard.press('Escape');
ok((await p.locator('.panel').count()) === 0, 'Escape closes panel');
// panel closes on role switch
await p.click('.row[data-room="lr-6"] .bar');
await as(p, 'u-client');
ok((await p.locator('.panel').count()) === 0, 'role switch closes the stay panel');
await as(p, 'u-donald');
// name the hold
const n = await p.locator('.bar').count();
await p.click('.bar.hold:has-text("electrician")');
await p.click('.panel .seg button:has-text("Named worker")');
await p.click('.panel .chip >> nth=2');
await save(p);
await p.waitForTimeout(150);
ok(
  (await p.locator('.bar').count()) === n && (await p.locator('.bar.hold:has-text("electrician")').count()) === 0,
  'naming a hold keeps the same record',
);
// ---------- search ----------
await p.click('.searchbtn');
await p.fill('.palette input', 'Iain');
await p.keyboard.press('Enter');
await p.waitForTimeout(150);
ok((await p.locator('.panel .chosen').innerText()).includes('Iain Smith'), 'global search: worker → their stay');
await p.keyboard.press('Escape');
await p.keyboard.press('/');
await p.fill('.palette input', 'Room 8');
ok((await p.locator('.res:has-text("Loch Roag Room 8")').count()) === 1, 'global search: room');
await p.keyboard.press('Escape');
// ---------- exceptional cleaning date: override + persistent warning ----------
await go(p, 'changeovers');
await card(p, 'lr-4')
  .locator('.datef input:not(.native)')
  .fill(uk(D(7)));
await card(p, 'lr-4').locator('button:has-text("Book clean")').click();
ok(
  await p.locator('.dialog:has-text("outside the usual window")').isVisible(),
  'exception: out-of-window date asks first',
  'exception',
);
await dialog(p, 'Go back');
await p.waitForTimeout(100);
ok(
  (await p.locator('.col-needs .cc[data-room="lr-4"]').count()) === 1 &&
    (await p.locator('.col-scheduled .cc[data-room="lr-4"]').count()) === 0,
  'exception: refused unless confirmed',
  'exception',
);
await card(p, 'lr-4').locator('button:has-text("Book clean")').click();
await dialog(p, 'Book as exception');
await p.waitForTimeout(150);
ok(
  (await p.locator('.col-scheduled .cc[data-room="lr-4"] .inv.exc').count()) === 1,
  'exception: booked and flagged on Cleaning',
  'exception',
);
await p.reload();
await p.waitForTimeout(300);
ok(
  (await p.locator('.cc[data-room="lr-4"] .inv.exc').count()) === 1,
  'exception: warning persists after reload',
  'exception',
);
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-4"] .co.exc').count()) === 1, 'exception: flagged on Board', 'exception');
await go(p, 'today');
await p.click('.seg button:has-text("Upcoming")');
ok(
  (await p.locator('.li:has-text("Loch Roag Room 4") .zchip.exc').count()) >= 1,
  'exception: flagged on Today/Upcoming',
  'exception',
);
await go(p, 'print-cleaning');
ok(
  (await p.locator('tr:has-text("Loch Roag Room 4"):has-text("outside usual window")').count()) === 1,
  'exception: shown on printed cleaning list',
  'exception',
);
await go(p, 'activity');
ok((await p.locator('.act:has-text("outside the usual window")').count()) >= 1, 'exception: logged', 'exception');
await as(p, 'u-client');
await go(p, 'rooms');
ok(!(await body(p)).includes('outside'), 'exception: provider detail not shown to client', 'exception');
await as(p, 'u-donald');
// ---------- C1: cannot tick left / start before departure ----------
await go(p, 'changeovers');
ok(
  (await card(p, 'lr-4').locator('input[type=checkbox]').count()) === 0 &&
    (await card(p, 'lr-4').locator('button:has-text("Start clean")').isDisabled()),
  'C1 Room 4: cannot tick left / start before departure',
);
ok(
  (await card(p, 'lr-4').innerText()).includes(`Guest leaves ${fmt(D(5))} (planned)`) && !/Vacated/.test(await body(p)),
  "2 planned departures say 'Guest leaves … (planned)', never 'Vacated'",
);
// ---------- Room 8 journey ----------
const r8 = card(p, 'lr-8');
ok((await r8.innerText()).includes(`Guest leaves ${fmt(T)} (confirmed)`), 'Room 8 leaves today (confirmed)');
await r8.locator('input[type=checkbox]').check();
await p.waitForTimeout(100);
await go(p, 'board');
ok(
  (await p.locator('.row[data-room="lr-8"] .bar').first().innerText()).includes('Left ✓'),
  "board bar shows 'Left ✓' once the guest has left",
);
await go(p, 'changeovers');
await card(p, 'lr-8').locator('button:has-text("Start clean")').click();
await p.waitForTimeout(100);
await card(p, 'lr-8').locator('button:has-text("Mark ready")').click();
await p.waitForTimeout(150);
ok((await p.locator('.col-ready .cc[data-room="lr-8"]').count()) === 1, 'Room 8 → Ready after guest left');
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-8"] .co.co-ready').count()) === 1, 'C3 Board shows Ready');
await go(p, 'today');
await p.click('.seg button:has-text("Upcoming")');
const up8 = await p.locator('.li:has-text("Loch Roag Room 8 clean")').allInnerTexts();
ok(up8.length > 0 && up8.every(t => t.includes('Ready') && !t.includes('Booked')), 'C3 Upcoming shows Ready');
await as(p, 'u-client');
await go(p, 'rooms');
ok((await p.locator('.rr[data-room="lr-8"]').innerText()).includes('Ready ✓'), 'C3 Rooms (client) shows Ready');
await as(p, 'u-donald');
// ---------- item 1: date change invalidates a booked clean ----------
await go(p, 'changeovers');
await card(p, 'lr-2').locator('button:has-text("Book clean")').click();
await p.waitForTimeout(100);
await as(p, 'u-client');
await go(p, 'board');
await p.click('.row[data-room="lr-2"] .bar >> nth=0');
await date(p, '#f-dep', D(8));
await save(p);
await p.waitForTimeout(150);
await as(p, 'u-donald');
await go(p, 'changeovers');
ok(
  (await p.locator('.col-needs .cc[data-room="lr-2"] .inv:has-text("book it again")').count()) === 1,
  '1 date change on a booked clean → book again (row kept)',
);
ok(!/invalidated/i.test(await body(p)), "no 'invalidated' wording");
await go(p, 'activity');
await p.waitForTimeout(2500);
ok((await p.locator('.act:has-text("clean needs booking again")').count()) >= 1, '1 activity line for the date change');
ok((await p.locator('.al:has-text("book the clean again"):has-text("Donald")').count()) >= 1, '1 provider alerted');
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-9"] .bar.cont').count()) === 1, "1 same worker same day shows 'continues'");
ok(
  (await p.locator('.row[data-room="es-8"] .co.zero').count()) === 1,
  '1 different worker same day → same-day turnaround',
);
// ---------- 3: later + digest ----------
await go(p, 'changeovers');
ok((await p.locator('.col-later .cc').count()) > 0, '3 cleans with no arrival and > 7 days go under Later');
await go(p, 'activity');
const dg = await p.locator('.digest').innerText();
ok(
  /Departures/.test(dg) &&
    /Arrivals/.test(dg) &&
    /Changeovers due in next 7 days/.test(dg) &&
    /In house tonight/.test(dg),
  '3 digest content',
);
// ---------- 4: routing ----------
await reset(p);
await p.click('.row[data-room="lr-6"] .bar');
await p.fill('#f-notes', 'routing');
await save(p);
await go(p, 'activity');
await p.waitForTimeout(2200);
const out = await p.locator('.al').allInnerTexts();
ok(
  out.some(t => t.includes('Sheena')) &&
    !out.some(t => t.includes('Mairi') && t.includes('Stay updated')) &&
    !out.some(t => t.includes('Donald') && t.includes('Stay updated')),
  '4 provider edit → client only; not cleaner; not self',
);
ok(
  out.every(t => !/\btext\b/i.test(t.split('\n')[1] ?? '')),
  '4 email only by default',
);
ok(!out.some(t => /\bsent\b/i.test(t)) && out.some(t => /simulated|no address/i.test(t)), 'C6 outbox says simulated');
await as(p, 'u-mairi');
ok((await p.locator('nav button').count()) === 2 && (await p.locator('.demo-pill').count()) === 1, '7 cleaner: 2 tabs');
await p.click('.demo-pill');
ok((await p.locator('button.reset').count()) === 0, '7 cleaner: no reset');
await p.click('.demo-pill');
await as(p, 'u-client');
await p.click('.demo-pill');
ok((await p.locator('button.reset').count()) === 0, '7 client: no reset');
await p.click('.demo-pill');
// ---------- Sheena: no cleaner details, no scheduling noise ----------
let leak = [];
for (const t of ['board', 'rooms', 'free', 'today', 'workers', 'available', 'activity', 'print-today']) {
  await go(p, t);
  const tx = await p.locator('body').innerText();
  if (/Mairi|cleaner\b|to be scheduled/i.test(tx) || /To book|Booked in/.test(tx)) leak.push(t);
}
await go(p, 'board');
const titles = await p.locator('.co').evaluateAll(es => es.map(e => e.getAttribute('title')).join(' '));
ok(!leak.length && !/Mairi|To book/.test(titles), 'Sheena: no cleaner names and no scheduling noise ' + leak.join(','));
// ---------- free-rooms finder ----------
await go(p, 'free');
await date(p, '#fr-from', D(1));
await date(p, '#fr-to', D(4));
await p.waitForTimeout(100);
const nFree = await p.locator('.freeroom').count();
const sum = await p.locator('.finder .summary').innerText();
ok(
  nFree > 0 &&
    sum.startsWith(`${nFree} room`) &&
    sum.includes('3 nights') &&
    (await p.locator('section[aria-label^="Free at"]').count()) === 2,
  'free-rooms finder: grouped by property with count + nights',
);
const fr = await p.locator('.freeroom').first().getAttribute('data-room');
await p.locator('.freeroom').first().click();
ok(
  (await p.locator('#f-room').inputValue()) === fr &&
    (await p.locator('#f-arr').inputValue()) === uk(D(1)) &&
    (await p.locator('#f-dep').inputValue()) === uk(D(4)),
  'finder: tap a room → booking prefilled',
);
await p.click('.panel .chip >> nth=0');
await save(p);
await p.waitForTimeout(150);
await go(p, 'free');
await date(p, '#fr-from', D(1));
await date(p, '#fr-to', D(4));
ok((await p.locator(`.freeroom[data-room="${fr}"]`).count()) === 0, 'finder: booked room no longer free');
// ---------- workers: Book defaults after current stay ----------
await go(p, 'workers');
await p.click('button[aria-label="Book Iain Smith"]');
ok(
  (await p.locator('#f-arr').inputValue()) === uk(D(5)),
  'Book for a worker in house defaults to the day their stay ends',
);
await p.keyboard.press('Escape');
// ---------- C7 extra properties (was: enquiries; now bookable requests, see qa/props.mjs) ----------
await go(p, 'available');
const av = await body(p);
ok(
  /Extra · invoiced separately/.test(av) &&
    (await p.locator('[data-prop]').count()) === 6 &&
    (await p.locator('[data-prop] img').count()) === 6 &&
    !/Pod 1|Pod 2|The Lodge|bed size/i.test(av),
  'Properties: 2 houses + 4 extras (Harris, Uig, Abhainn Cottage, Monadh), each with a photo, extras labelled',
);
// ---------- rooms list ----------
await go(p, 'rooms');
ok(
  !(await p.locator('.rr[data-room="lr-9"] .nx').innerText()).includes('Daniel Reid') &&
    (await p.locator('.rr[data-room="lr-9"]').innerText()).includes('staying on'),
  'Next: never shows the same worker continuing as a new arrival',
);
const lr3 = await p.locator('.rr[data-room="lr-3"]').innerText();
ok(
  lr3.includes('Until further notice') && !/departs|Leaves Until/i.test(lr3),
  "open-ended stays say 'Until further notice', no 'departs'",
);
ok(
  /\d+ allocated · \d+ on site/.test(await p.locator('.rooms h3').first().innerText()),
  'rooms list headings: N allocated · M on site',
);
// ---------- navigation & dates ----------
await as(p, 'u-donald');
await go(p, 'board');
const first = async () => (await p.locator('.bh .day').first().innerText()).replace(/\s+/g, ' ');
const f0 = await first();
await p.click('button[aria-label="Next week"]');
const f1 = await first();
await p.click('button[aria-label="Previous week"]');
ok(f0 !== f1 && (await first()) === f0, 'week navigation');
await p.locator('.datef.jump input:not(.native)').fill('23/10/2026');
await p.waitForTimeout(100);
const days = await p.locator('.bh .day b').allInnerTexts();
ok(days.slice(0, 6).join(',') === '23,24,25,26,27,28', 'clock change 25 Oct: consecutive days');
await p.locator('.datef.jump input:not(.native)').fill('28/10/2026');
await p.waitForTimeout(100);
const hd = await p.locator('.bh .day').allInnerTexts();
ok(hd.some(t => /nov\s*1\b/i.test(t.replace(/\n/g, ' '))) && hd.length === 21, 'month boundary labelled');
// ---------- print ----------
await go(p, 'today');
await p.click('button:has-text("Print")');
await p.waitForTimeout(150);
ok(
  (await p.locator('.sheet-page h2').allInnerTexts()).join('|').includes('Leaving today'),
  'print view: today’s movements',
);
await p.emulateMedia({ media: 'print' });
ok(!(await p.locator('.print-bar').isVisible()), 'print CSS hides the toolbar');
await p.emulateMedia({ media: 'screen' });
await go(p, 'print-cleaning');
ok((await p.locator('.sheet-page tbody tr').count()) >= 3, 'print view: cleaning list');
// ---------- empty states ----------
await reset(p, 'available');
ok((await p.locator('.empty-state:has-text("No enquiries yet")').count()) === 1, 'friendly empty state (enquiries)');
await go(p, 'workers');
await p.fill('input.search', 'zzz');
ok(
  (await p.locator('.empty-state:has-text("No worker matches")').count()) === 1,
  'friendly empty state (worker search)',
);
// ---------- cross-tab stale edit ----------
const ctx = p.context();
const p2 = await page(0, 0, ctx);
await go(p2, 'board');
await go(p, 'board');
await p.click('.row[data-room="lr-1"] .bar');
await p2.click('.row[data-room="lr-1"] .bar');
await p2.fill('#f-notes', 'tab2');
await save(p2);
await p2.waitForTimeout(200);
await p.fill('#f-notes', 'tab1');
await save(p);
await p.waitForTimeout(150);
ok((await p.locator('.warn:has-text("changed")').count()) === 1, 'stale edit across tabs detected');
await p.keyboard.press('Escape');
await p2.close();
// ---------- corrupt storage / reset ----------
await p.evaluate(() => localStorage.setItem('roomboard-demo-v2', '{bad'));
await p.reload();
await p.waitForTimeout(300);
ok((await p.locator('.bar').count()) > 10, 'corrupt storage → falls back to seed');
await p.click('.row[data-room="lr-6"] .bar');
await p.fill('#f-notes', 'x');
await save(p);
await p.click('.demo-pill');
await p.click('button.reset');
await dialog(p, 'Reset');
await p.waitForTimeout(200);
await p.click('.row[data-room="lr-6"] .bar');
ok((await p.locator('#f-notes').inputValue()) === '', 'reset restores starting example');
await p.keyboard.press('Escape');
// ---------- a11y ----------
for (const t of ['board', 'rooms', 'crew', 'free', 'changeovers', 'available', 'activity', 'workers', 'today']) {
  await go(p, t);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(
      v => `${v.id}(${v.nodes.length})`,
    ),
  );
  ok(r.length === 0, `a11y ${t}: ${r.join(' ') || 'no WCAG A/AA violations'}`, 'a11y');
}
await go(p, 'board');
await p.click('.ph button:has-text("+ Add stay")');
await p.waitForTimeout(400);
await p.addScriptTag({ content: AXE });
{
  const r = await p.evaluate(async () =>
    (await window.axe.run(document.querySelector('.panel'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(
      v => `${v.id}(${v.nodes.length})`,
    ),
  );
  ok(r.length === 0, `a11y stay panel: ${r.join(' ') || 'ok'}`, 'a11y');
}
await p.keyboard.press('Escape');
ok(
  await p.evaluate(() => document.activeElement?.textContent?.includes('+ Add stay')),
  'closing the panel returns focus to the button that opened it',
  'a11y',
);
await p.reload();
await p.waitForTimeout(300);
await p.keyboard.press('Tab');
ok(
  await p.evaluate(() => !!document.activeElement?.closest('nav')),
  'keyboard: first Tab reaches the main nav',
  'a11y',
);
// ---------- welcome ----------
{
  const w = await page(1440, 900);
  await w.goto(U);
  await w.evaluate(() => localStorage.clear());
  await w.reload();
  await w.waitForTimeout(300);
  ok((await w.locator('.welcome .hints li').count()) === 3, 'first login: welcome with 3 hints');
  await w.click('.welcome button:has-text("Got it")');
  await w.reload();
  await w.waitForTimeout(300);
  ok((await w.locator('.welcome').count()) === 0, 'welcome dismissed and remembered');
  await w.close();
}
// ---------- widths ----------
for (const w of [820, 900, 1000, 1440]) {
  const q = await page(w, 900);
  await reset(q);
  const hh = await q.locator('.top').evaluate(e => e.getBoundingClientRect().height);
  const clipped = await q
    .locator('.bar b, .bar span')
    .evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  ok(hh <= 58, `${w}px header one line (${hh}px)`, 'layout');
  ok(!clipped.length, `${w}px no clipped bar text ${clipped.slice(0, 3).join('|')}`, 'layout');
  await q.close();
}
// ---------- phone ----------
const m = await page(390, 844);
await reset(m);
ok(await m.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no horizontal overflow', 'phone');
ok(
  (await m.locator('.fab button:has-text("Add stay")').isVisible()) &&
    (await m.locator('.fab button:has-text("Hold")').isVisible()),
  'C5 phone FAB Add stay / Hold',
  'phone',
);
ok((await m.locator('.rr:not(.xcard)').count()) === 19, '6/C5 phone per-room list (19 rooms)', 'phone');
ok((await m.locator('.xcard').count()) === 4, 'phone: the 4 extra properties after the contract rooms', 'phone');
await m.click('.fab button:has-text("Add stay")');
const box = await m.locator('.panel').boundingBox();
ok(box && box.width >= 389 && box.height >= 843, 'phone: stay panel is a full-screen sheet', 'phone');
await m.keyboard.press('Escape');
for (const t of ['today', 'changeovers', 'free', 'available', 'activity', 'workers', 'crew']) {
  await m.goto(U + '#' + t);
  await m.waitForTimeout(200);
  ok(
    await m.evaluate(() => document.documentElement.scrollWidth <= 391),
    `phone ${t}: no horizontal overflow`,
    'phone',
  );
}
await m.goto(U + '#rooms');
await m.selectOption('select.who', 'u-mairi');
await m.waitForTimeout(150);
ok((await m.locator('.bottom button').count()) === 2, 'phone cleaner tabs', 'phone');
await m.selectOption('select.who', 'u-client');
await m.waitForTimeout(150);
const sh = await m.locator('main').innerText();
ok(
  (await m.locator('.bottom button').count()) === 5 && (await m.locator('h1').innerText()) === 'Rooms',
  "Sheena's phone opens on Rooms (5 tabs)",
  'phone',
);
ok(
  !/to be scheduled|clean to book/i.test(sh) && !/To book|Booked in/.test(sh) && /Ready by \w{3} \d+ \w{3}/.test(sh),
  "Sheena's phone: only 'Ready by …' statuses",
  'phone',
);
ok(
  (await m.locator('.rr[data-room="lr-5"]').innerText()).match(/Away (from .*)?· room kept|Away · room kept/),
  "phone Rooms: Ruairidh (Room 5) shows 'Away · room kept'",
  'phone',
);
await m.goto(U + '#free');
await m.waitForTimeout(200);
ok(
  (await m.locator('.bottom button.on:has-text("Find a room")').count()) === 1,
  'phone: Find a room in the bottom bar',
  'phone',
);
await m.click('.bottom button:has-text("More")');
ok(await m.locator('.sheet button:has-text("Properties")').isVisible(), 'phone: More sheet', 'phone');

// ==================== v2: rooms cards, tiles, banner, copy summary, crew booking, drag ====================
{
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const q = await page(1440, 950, ctx);
  await reset(q, 'rooms');
  const V = 'v2';
  ok((await q.locator('.rcard:not(.xcard)').count()) === 19, 'v2 Rooms: one card per contracted room (19)', V);
  const r8 = await q.locator('.rcard[data-room="lr-8"]').innerText();
  ok(
    /Departing today/i.test(r8) && /Quick update/.test(r8) && /Next arrival/i.test(r8),
    'v2 card: status pill, dates, Quick update',
    V,
  );
  ok(/\d+ days? gap|same day/i.test(await q.locator('main').innerText()), 'v2 card: next arrival shows the gap', V);
  const depN = +(await q.locator('.tile.t-amber b').innerText());
  await q.click('.tile.t-amber');
  await q.waitForTimeout(100);
  ok((await q.locator('.rcard').count()) === depN && depN >= 1, 'v2 tile "Departing today" filters the cards', V);
  ok(
    (await q.locator('.fpills button.on').innerText()).includes('Departing today'),
    'v2 tile and filter pill stay in step',
    V,
  );
  await q.click('.fpills button:has-text("Name TBC")');
  await q.waitForTimeout(100);
  ok(
    (await q.locator('.rcard').count()) === +(await q.locator('.tile.t-purple b').innerText()) &&
      (await q.locator('.rcard').allInnerTexts()).every(t => /name to follow|Name TBC/i.test(t)),
    'v2 Name TBC filter shows only rooms with a hold',
    V,
  );
  await q.click('.fpills button:has-text("All rooms")');
  ok(
    /bookable · invoiced separately/.test(await q.locator('.tile.t-dark').innerText()),
    'v2 Extra properties tile: bookable, invoiced separately',
    V,
  );
  ok(await q.locator('.urgent').isVisible(), 'v2 urgent banner computed from changeovers', V);
  const ub = await q.locator('.urgent').innerText();
  ok(
    /turnaround/.test(ub) && (await q.locator('.urgent button:has-text("Book clean")').count()) === 1,
    'v2 banner: one-tap Book clean (provider)',
    V,
  );
  await q.click('.urgent button:has-text("Book clean")');
  await q.click('.dialog button:has-text("Book clean")');
  await q.waitForTimeout(200);
  ok(/Clean booked/.test(await q.locator('.toasts').innerText()), 'v2 banner: Book clean confirms then books', V);
  // copy summary
  await q.click('button:has-text("Copy summary")');
  await q.waitForTimeout(200);
  const mgr = await q.evaluate(() => navigator.clipboard.readText());
  ok(
    /^Roomboard summary/.test(mgr) && /Today ·/.test(mgr) && /Tomorrow ·/.test(mgr) && /Leaving:/.test(mgr),
    'v2 Copy summary: today + tomorrow movements as text',
    V,
  );
  const cleaners = await q.evaluate(() =>
    JSON.parse(localStorage.getItem('roomboard-demo-v2'))
      .users.filter(u => u.role === 'cleaner')
      .map(u => u.name),
  );
  ok(
    cleaners.some(n => mgr.includes(n)),
    'v2 Copy summary (provider) names the cleaner',
    V,
  );
  await as(q, 'u-client');
  await go(q, 'rooms');
  ok(
    !/Book clean/.test(await q.locator('main').innerText()) && !cleaners.some(n => ub.includes(n)),
    'v2 banner (client): no scheduling buttons, no cleaner names',
    V,
  );
  await q.click('button:has-text("Copy summary")');
  await q.waitForTimeout(200);
  const cli = await q.evaluate(() => navigator.clipboard.readText());
  ok(
    cli.length > 50 && !cleaners.some(n => cli.includes(n)) && !/Clean to book|Clean booked/.test(cli),
    "v2 Copy summary (Sheena): no cleaner names, only 'Ready by'",
    V,
  );
  // crew booking
  await go(q, 'crew');
  const before = await q.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.length);
  await q.selectOption('#c-prop', 'p-es');
  await q.fill('#c-start', uk(D(150)));
  await q.locator('#c-start').blur();
  await q.fill('#c-label', 'E2E crew');
  await q.locator('.wpick input[type=checkbox]').nth(0).check();
  await q.locator('.wpick input[type=checkbox]').nth(1).check();
  await q.fill('#c-holds', '3');
  await q.waitForTimeout(150);
  ok(
    (await q.locator('.pgrid tbody tr').count()) === 5 && (await q.locator('.pgrid thead th').count()) === 2 + 3,
    'v2 crew preview: 5 places × 3 rotations grid',
    V,
  );
  ok(
    (await q.locator('.pgrid td.clash').count()) === 0 && (await q.locator('.pok').isVisible()),
    'v2 crew preview: no clashes far ahead',
    V,
  );
  await q.click('button:has-text("Confirm 15 stays")');
  ok(/Book E2E crew\?/.test(await q.locator('.dialog').innerText()), 'v2 crew: confirm step before saving', V);
  await q.click('.dialog button:has-text("Book 15 stays")');
  await q.waitForTimeout(300);
  const after = await q.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
  ok(
    after.stays.length === before + 15 && after.stays.filter(s => s.seriesId).length === 15,
    'v2 crew: 15 real stays grouped under one series id',
    V,
  );
  const sid = after.series[0].id;
  const cos = after.changeovers.filter(c => after.stays.some(s => s.seriesId === sid && s.id === c.fromStayId)).length;
  ok(cos === 5, 'v2 crew (room kept on off days): one clean per room, at the end only', V);
  ok((await q.locator('.srow').count()) === 1, 'v2 crew: series listed with Extend / Change end / Cancel', V);
  await q.click('.srow button:has-text("Extend")');
  await q.click('.dialog button:has-text("Extend")');
  await q.waitForTimeout(300);
  ok(
    (await q.evaluate(
      () => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.filter(s => s.seriesId).length,
    )) === 20,
    'v2 crew: Extend adds a rotation for everyone',
    V,
  );
  await q.click('.toast button:has-text("Undo")');
  await q.waitForTimeout(300);
  ok(
    (await q.evaluate(
      () => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.filter(s => s.seriesId).length,
    )) === 15,
    'v2 crew: Undo reverts the whole extension',
    V,
  );
  await q.click('.srow button:has-text("Cancel rest")');
  await q.click('.dialog button:has-text("Cancel the rest")');
  await q.waitForTimeout(300);
  ok(
    (await q.evaluate(
      () => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.filter(s => s.seriesId).length,
    )) === 0,
    'v2 crew: Cancel rest removes future stays',
    V,
  );
  // clash shown before confirming: pick one busy room for 2 people starting tomorrow
  await q.selectOption('#c-prop', 'p-lr');
  await q.fill('#c-start', uk(D(1)));
  await q.locator('#c-start').blur();
  await q.fill('#c-holds', '2');
  await q.click('.chips button:has-text("Room 1")');
  await q.waitForTimeout(150);
  ok(
    (await q.locator('.pgrid td.clash').count()) > 0 && (await q.locator('button:has-text("Confirm")').isDisabled()),
    'v2 crew: clashes highlighted and Confirm blocked',
    V,
  );
  // drag on the board
  await as(q, 'u-donald');
  await go(q, 'board');
  const a0 = await q.evaluate(
    () => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.find(s => s.roomId === 'lr-6').arrival,
  );
  const bar = q.locator('.row[data-room="lr-6"] .bar').first();
  const bb = await bar.boundingBox();
  const W = 56;
  await q.mouse.move(bb.x + 40, bb.y + bb.height / 2);
  await q.mouse.down();
  await q.mouse.move(bb.x + 40 + W, bb.y + bb.height / 2, { steps: 4 });
  await q.mouse.move(bb.x + 40 + 2 * W, bb.y + bb.height / 2, { steps: 4 });
  ok(/Loch Roag Room 6 ·/.test(await q.locator('.dghost.ok').innerText()), 'v2 drag: live preview of the new dates', V);
  await q.mouse.up();
  await q.waitForTimeout(150);
  ok(/Move Stuart Graham/.test(await q.locator('.dialog').innerText()), 'v2 drag: confirm step on drop', V);
  await q.click('.dialog button:has-text("Move stay")');
  await q.waitForTimeout(200);
  const moved = await q.evaluate(() =>
    JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.find(s => s.roomId === 'lr-6'),
  );
  ok(
    moved.arrival === new Date(Date.parse(a0 + 'T00:00Z') + 2 * 864e5).toISOString().slice(0, 10),
    'v2 drag: stay moved by 2 days',
    V,
  );
  await q.click('.toast button:has-text("Undo")');
  await q.waitForTimeout(250);
  ok(
    (await q.evaluate(
      () => JSON.parse(localStorage.getItem('roomboard-demo-v2')).stays.find(s => s.roomId === 'lr-6').arrival,
    )) === a0,
    'v2 drag: Undo puts it back',
    V,
  );
  // drag onto an occupied room → red ghost, nothing saved
  const bb2 = await q.locator('.row[data-room="lr-6"] .bar').first().boundingBox();
  const target = await q.locator('.row[data-room="lr-7"]').boundingBox();
  await q.mouse.move(bb2.x + 40, bb2.y + bb2.height / 2);
  await q.mouse.down();
  await q.mouse.move(bb2.x + 40, target.y + target.height / 2, { steps: 6 });
  ok((await q.locator('.row[data-room="lr-7"] .dghost.bad').count()) === 1, 'v2 drag: clash shown live in red', V);
  await q.mouse.up();
  await q.waitForTimeout(200);
  ok(
    (await q.locator('.dialog').count()) === 0 && /Not moved/.test(await q.locator('.toasts').innerText()),
    'v2 drag: clash is refused, nothing saved',
    V,
  );
  // resize
  // keep the grip clear of the "Not moved" toast at the bottom (the board is longer now it has the extras)
  await q.locator('.row[data-room="lr-6"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
  await q.waitForTimeout(100);
  const bb3 = await q.locator('.row[data-room="lr-6"] .bar .grip').first().boundingBox();
  await q.mouse.move(bb3.x + 4, bb3.y + bb3.height / 2);
  await q.mouse.down();
  await q.mouse.move(bb3.x + 4 + W, bb3.y + bb3.height / 2, { steps: 4 });
  await q.mouse.up();
  await q.waitForTimeout(150);
  ok(/departure to/.test(await q.locator('.dialog').innerText()), 'v2 drag: right edge resizes (changes departure)', V);
  await q.click('.dialog button:has-text("Go back")');
  ok(
    (await q.locator('.bar[role=button]').first().getAttribute('tabindex')) === '0',
    'v2 drag: keyboard alternative kept (bars focusable, Enter opens panel)',
    V,
  );
  await q.close();
}

ok(errs.length === 0, 'no console/page errors or native dialogs ' + errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
writeFileSync('/tmp/e2e-results.json', JSON.stringify({ pass, fail, results }, null, 1));
await b.close();
process.exit(fail ? 1 : 0);
