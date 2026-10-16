// Full QA suite: node qa/qa.mjs (needs `npx vite preview --port 4173` running on a production build)
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0,
  fail = 0;
const errs = [];
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
};
async function page(w = 1440, h = 950, ctx) {
  const c = ctx ?? (await b.newContext({ viewport: { width: w, height: h } }));
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => ((p.__dialog ?? 'accept') === 'accept' ? d.accept() : d.dismiss()));
  return p;
}
const reset = async p => {
  await p.goto(U + '#board');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('.bar');
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
const save = p => p.click('.panel .pa .btn:not(.ghost)');

const p = await page();
await reset(p);
// --- basics
ok((await p.locator('.top .live').innerText()).includes('Demo'), 'C6 header says Demo, not Live');
ok(
  (await p.locator('.kpis .k:has-text("Rooms allocated")').count()) === 1 &&
    (await p.locator('.kpis .k:has-text("Expected on site")').count()) === 1,
  'C4 KPIs: Rooms allocated + Expected on site',
);
ok(await p.locator('button.reset:has-text("Reset demo data")').isVisible(), '7 Reset demo data visible to provider');
// --- add / edit / extend / move / cancel
await p.click('text=+ Add stay');
await p.click('.panel .chip >> nth=0');
await p.selectOption('#f-room', 'es-9');
await p.fill('#f-arr', '2026-10-18');
await p.fill('#f-dep', '2026-10-22');
await save(p);
await p.waitForTimeout(200);
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 1, 'add stay');
await p.reload();
await p.waitForSelector('.bar');
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 1, 'reload persistence');
await p.click('.row[data-room="es-9"] .bar');
await p.fill('#f-dep', '2026-10-25');
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
await p.click('.row[data-room="es-5"] .bar');
await p.click('.panel button:has-text("Cancel stay")');
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="es-5"] .bar').count()) === 0, 'cancel stay');
// --- validation
await p.click('text=+ Add stay');
await p.click('.panel .chip >> nth=0');
await p.selectOption('#f-room', 'lr-1');
ok(
  (await p.locator('.panel .err:has-text("Clashes")').count()) === 1 &&
    (await p.locator('.panel .pa .btn:not(.ghost)').isDisabled()),
  'clash blocked',
);
await p.selectOption('#f-room', 'es-9');
await p.fill('#f-dep', '2026-10-10');
ok((await p.locator('.panel .err:has-text("after arrival")').count()) === 1, 'departure before arrival blocked');
await p.fill('#f-dep', '');
ok((await p.locator('.panel .err').count()) === 1, 'empty departure blocked');
await p.click('.panel [role=group] button:has-text("Until further notice")');
ok(await p.locator('#f-dep').isDisabled(), 'UFN disables departure');
await save(p);
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="es-9"] .bar.open').count()) === 1, 'UFN stay open-ended');
ok((await p.locator('.row[data-room="lr-7"] .bar.open').count()) === 1, 'TBC stay shown open-ended');
await p.keyboard.press('Escape');
// away
await p.click('.row[data-room="lr-6"] .bar');
await p.click('.panel summary');
await p.fill('[aria-label="Away from"]', '2026-10-20');
await p.fill('[aria-label="Back on"]', '2026-10-19');
ok((await p.locator('.panel .err:has-text("Away")').count()) === 1, 'away: back before leaves blocked');
await p.fill('[aria-label="Back on"]', '2026-10-23');
await save(p);
await p.waitForTimeout(150);
ok((await p.locator('.row[data-room="lr-6"] .away').count()) === 1, 'away, room retained shown');
await p.click('.row[data-room="lr-6"] .bar');
await p.keyboard.press('Escape');
ok((await p.locator('.panel').count()) === 0, 'Escape closes panel');
// --- name the hold (same record)
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
// --- C2 Room 4: clean after next arrival (Thu 22 Oct) needs explicit provider exception
await go(p, 'changeovers');
p.__dialog = 'dismiss';
await card(p, 'lr-4').locator('input[type=date]').fill('2026-10-23');
await card(p, 'lr-4').locator('button:has-text("Schedule")').click();
await p.waitForTimeout(150);
ok(
  (await p.locator('.col-needs .cc[data-room="lr-4"]').count()) === 1 &&
    (await p.locator('.col-scheduled .cc[data-room="lr-4"]').count()) === 0,
  'C2 out-of-window clean (23 Oct > arrival 22 Oct) refused without exception',
);
p.__dialog = 'accept';
await card(p, 'lr-4').locator('input[type=date]').fill('2026-10-23');
await card(p, 'lr-4').locator('button:has-text("Schedule")').click();
await p.waitForTimeout(150);
ok((await p.locator('.cc[data-room="lr-4"] .inv.exc').count()) === 1, 'C2 provider exception flagged on Changeovers');
// --- C1 Room 4 (Iain to 21 Oct): cannot record vacated / start / ready before the actual departure
const t4 = await card(p, 'lr-4').innerText();
ok(
  (await card(p, 'lr-4').locator('input[type=checkbox]').count()) === 0 &&
    (await card(p, 'lr-4').locator('button:has-text("Start clean")').isDisabled()),
  'C1 Room 4: cannot mark vacated/start before 21 Oct departure',
);
ok(
  !/Vacated \w{3} \d/.test(t4) && t4.includes('Departs Wed 21 Oct (planned)'),
  "2 'Departs Wed 21 Oct (planned)', never 'Vacated <date>'",
);
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-4"] .co.exc').count()) === 1, 'C2 exception flagged on Board');
await go(p, 'today');
await p.click('.seg button:has-text("Upcoming")');
ok(
  (await p.locator('.li:has-text("Loch Roag Room 4") .zchip.exc').count()) >= 1,
  'C2 exception flagged on Today/Upcoming',
);
// --- Room 8 journey: departs today → vacated → start → ready; consistent status everywhere (C3)
await go(p, 'changeovers');
const r8 = card(p, 'lr-8');
ok((await r8.innerText()).includes('Departs Fri 16 Oct (confirmed)'), 'Room 8 departs today (confirmed)');
await r8.locator('input[type=checkbox]').check();
await p.waitForTimeout(100);
await card(p, 'lr-8').locator('button:has-text("Start clean")').click();
await p.waitForTimeout(100);
await card(p, 'lr-8').locator('button:has-text("Mark Ready")').click();
await p.waitForTimeout(150);
ok((await p.locator('.col-ready .cc[data-room="lr-8"]').count()) === 1, 'Room 8 → Ready after vacated');
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-8"] .co.co-ready').count()) === 1, 'C3 Board shows Ready');
await go(p, 'today');
await p.click('.seg button:has-text("Upcoming")');
const up8 = await p.locator('.li:has-text("Loch Roag Room 8 changeover")').allInnerTexts();
ok(
  up8.length > 0 && up8.every(t => t.includes('Ready') && !t.includes('Scheduled')),
  'C3 Upcoming shows Ready, not Scheduled',
);
// --- item 1: date change on linked stay invalidates, keeps id, logs, alerts provider; client edit
await go(p, 'changeovers');
const r2 = card(p, 'lr-2');
await r2.locator('button:has-text("Schedule")').click();
await p.waitForTimeout(100);
await as(p, 'u-client');
await go(p, 'board');
await p.click('.row[data-room="lr-2"] .bar >> nth=0');
await p.fill('#f-dep', '2026-10-24');
await save(p);
await p.waitForTimeout(150);
await as(p, 'u-donald');
await go(p, 'changeovers');
ok(
  (await p.locator('.col-needs .cc[data-room="lr-2"] .inv').count()) === 1,
  '1 extending linked stay → needs rescheduling (row kept)',
);
await go(p, 'activity');
await p.waitForTimeout(2500);
ok((await p.locator('.act:has-text("needs rescheduling")').count()) >= 1, '1 activity line for invalidation');
ok(
  (await p.locator('.al:has-text("needs rescheduling"):has-text("Donald")').count()) >= 1,
  '1 provider alerted on invalidation',
);
// same-day continues / zero-day
await go(p, 'board');
ok((await p.locator('.row[data-room="lr-9"] .bar.cont').count()) === 1, "1 same worker same day shows 'continues'");
ok(
  (await p.locator('.row[data-room="es-8"] .co.zero').count()) === 1,
  '1 different worker same day → same-day changeover',
);
await go(p, 'activity');
ok((await p.locator('.act:has-text("continues")').count()) >= 1, '1 continues logged');
// --- 3: later bucket + digest
await go(p, 'changeovers');
ok(
  (await p.locator('.col-later .cc').count()) > 0 &&
    (await p
      .locator('.col-needs .cc:has-text("No next arrival")')
      .evaluateAll(es =>
        es.every(e => /Departs (Fri 16|Sat 17|Sun 18|Mon 19|Tue 20|Wed 21|Thu 22|Fri 23) Oct/.test(e.textContent)),
      )),
  '3 Needs scheduling only ≤7 days or with arrival; rest under Later',
);
await go(p, 'activity');
const dg = await p.locator('.digest').innerText();
ok(
  /Departures/.test(dg) &&
    /Arrivals/.test(dg) &&
    /Changeovers due in next 7 days/.test(dg) &&
    /In house tonight/.test(dg),
  '3 digest content',
);
// --- 4: routing
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
  '4 provider stay edit → client only; not cleaner; not self',
);
ok(
  out.every(t => !/sms/i.test(t)),
  '4 email only by default (no SMS unless opted in)',
);
ok(
  !out.some(t => /\bsent\b/i.test(t)) && out.some(t => /simulated|no address/i.test(t)),
  'C6 outbox says Simulated, not SENT',
);
await as(p, 'u-mairi');
ok(
  (await p.locator('nav button').count()) === 2 && (await p.locator('button.reset').count()) === 0,
  '7 cleaner: 2 tabs, no reset',
);
await as(p, 'u-client');
ok((await p.locator('button.reset').count()) === 0, '7 client: no reset');
// --- Sheena leak
let leak = [];
for (const t of ['board', 'today', 'workers', 'changeovers', 'available', 'activity']) {
  await go(p, t);
  if (/Mairi|cleaner\b/i.test(await p.locator('body').innerText())) leak.push(t);
}
await go(p, 'board');
const titles = await p.locator('.co').evaluateAll(es => es.map(e => e.getAttribute('title')).join(' '));
ok(!leak.length && !/Mairi/.test(titles), 'Sheena never sees cleaner names ' + leak.join(','));
// --- C7 request
await go(p, 'available');
ok(
  (await p.locator('text=Available now').count()) === 0 && (await p.locator('text=Photos to follow').count()) >= 1,
  'C7 no "Available now"; Photos to follow kept',
);
await p.click('.ucard:has-text("Monadh") button:has-text("Request dates")');
await p.fill('.rq input[type=number]', '0');
await p.click('button:has-text("Send enquiry")');
ok((await p.locator('.rq .err').count()) === 1, 'Request: invalid people rejected');
await p.fill('.rq input[type=number]', '2');
await p.click('button:has-text("Send enquiry")');
await p.waitForTimeout(100);
ok(
  (await p.locator('.ok').innerText()).includes('Monadh · 2 people · Mon 19 Oct → Mon 2 Nov') &&
    /not a booking/.test(await p.locator('.ok').innerText()),
  'C7 enquiry echoes dates, needs provider confirmation',
);
// --- navigation & dates
await as(p, 'u-donald');
await go(p, 'board');
const first = async () => (await p.locator('.bh .day').first().innerText()).replace(/\s+/g, ' ');
const f0 = await first();
await p.click('button[aria-label="Next week"]');
const f1 = await first();
await p.click('button[aria-label="Previous week"]');
ok(f0 !== f1 && (await first()) === f0, 'week navigation');
await p.fill('input.jump', '2026-10-23');
await p.waitForTimeout(100);
const days = await p.locator('.bh .day b').allInnerTexts();
ok(days.slice(0, 6).join(',') === '23,24,25,26,27,28', 'clock change 25 Oct: consecutive days, no skip/dup');
await p.fill('input.jump', '2026-10-28');
await p.waitForTimeout(100);
const hd = await p.locator('.bh .day').allInnerTexts();
ok(hd.some(t => /nov\s*1\b/i.test(t.replace(/\n/g, ' '))) && hd.length === 21, 'month boundary labelled');
// --- cross-tab stale edit
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
// --- corrupt storage / reset
await p.evaluate(() => localStorage.setItem('roomboard-demo-v2', '{bad'));
await p.reload();
await p.waitForTimeout(300);
ok((await p.locator('.bar').count()) > 10, 'corrupt storage → falls back to seed');
await p.click('button.reset');
await p.waitForTimeout(200);
ok((await p.locator('.row[data-room="es-9"] .bar').count()) === 0, 'reset restores starting example');
// --- a11y (axe) desktop
for (const t of ['board', 'changeovers', 'available', 'activity']) {
  await go(p, t);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(
      v => `${v.id}(${v.nodes.length})`,
    ),
  );
  ok(r.length === 0, `a11y ${t}: ${r.join(' ') || 'no WCAG A/AA violations'}`);
}
await go(p, 'board');
await p.keyboard.press('Tab');
await p.keyboard.press('Tab');
ok(await p.evaluate(() => document.activeElement?.tagName === 'BUTTON'), 'keyboard focus reaches nav');
// --- widths: header no wrap, bars not clipped
for (const w of [820, 900, 1000, 1440]) {
  const q = await page(w, 900);
  await reset(q);
  const hh = await q.locator('.top').evaluate(e => e.getBoundingClientRect().height);
  const clipped = await q
    .locator('.bar b, .bar span')
    .evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  ok(hh <= 62, `${w}px header one line (${hh}px)`);
  ok(!clipped.length, `${w}px no clipped bar text ${clipped.slice(0, 3).join('|')}`);
  await q.close();
}
// --- phone
const m = await page(390, 844);
await reset(m).catch(() => {});
await m.goto(U + '#board');
await m.evaluate(() => localStorage.clear());
await m.reload();
await m.waitForTimeout(400);
ok(await m.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no horizontal overflow');
ok(
  (await m.locator('.fab button:has-text("Add stay")').isVisible()) &&
    (await m.locator('.fab button:has-text("Hold")').isVisible()),
  'C5 phone FAB Add stay / Hold',
);
await m.click('.seg button:has-text("Rooms")');
ok((await m.locator('.rr').count()) === 19, '6/C5 phone per-room list (19 rooms)');
ok((await m.locator('.rr').first().innerText()).includes('Next:'), 'rooms list shows next arrival');
await m.click('.fab button:has-text("Add stay")');
ok(await m.locator('.panel').isVisible(), 'phone FAB opens Add stay');
await m.keyboard.press('Escape');
for (const t of ['today', 'changeovers', 'available', 'activity', 'workers']) {
  await m.goto(U + '#' + t);
  await m.waitForTimeout(200);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= 391), `phone ${t}: no horizontal overflow`);
}
await m.goto(U + '#board');
await m.selectOption('select.who', 'u-mairi');
await m.waitForTimeout(150);
ok((await m.locator('.bottom button').count()) === 2, 'phone cleaner tabs');
await m.selectOption('select.who', 'u-client');
await m.waitForTimeout(150);
ok((await m.locator('.bottom button').count()) === 6, 'phone client tabs');

ok(errs.length === 0, 'no console/page errors ' + errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
