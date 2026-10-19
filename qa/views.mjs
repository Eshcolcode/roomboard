// Three logins (RJ McLeod, Eshcol, Housekeeper), who sees what, and the red dot: node qa/views.mjs
// (preview on :4173 or QA_URL). Targeted check. Screens go to SHOTS (default /workspace/flow-shots) as views-*.png.
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
const uk = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const settle = (p, ms = 350) => p.waitForTimeout(ms);
const KEY = 'roomboard-demo-v2';
const db = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const PEOPLE = /Sheena|Donald|Mairi|Macarthur/;
const ROLE = { client: 'u-client', manager: 'u-donald', cleaner: 'u-mairi' };

async function pg(w, h, { mode = 'classic' } = {}) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#board');
  await p.evaluate(m => {
    localStorage.clear();
    for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
    localStorage.setItem('rb-ui-mode', m);
  }, mode);
  await p.reload();
  await settle(p);
  return p;
}
const as = async (p, role) => {
  await p.selectOption('select.who', ROLE[role]);
  await settle(p);
};
const go = async (p, h) => {
  await p.evaluate(x => (location.hash = x), h);
  await settle(p);
};
const text = p => p.evaluate(() => document.body.innerText);
const dot = p => p.locator('[data-testid="red-dot"]').count();

for (const [w, h, tag] of [
  [1366, 860, 'desktop'],
  [390, 844, 'phone'],
]) {
  const p = await pg(w, h);
  // ---- 1. switcher and header: roles only, never a person's name ----
  const opts = await p.locator('select.who option').allInnerTexts();
  ok(
    JSON.stringify(opts) === JSON.stringify(['RJ McLeod', 'Eshcol', 'Housekeeper']),
    `${tag}: switcher = ${opts.join(' / ')}`,
  );
  for (const r of ['client', 'manager', 'cleaner']) {
    await as(p, r);
    const head = await p.locator('header.top').innerText();
    const sel = await p.locator('select.who').evaluate(s => s.options[s.selectedIndex].text);
    ok(!PEOPLE.test(head + sel), `${tag}: ${r} header has no personal names (${sel})`);
  }
  // ---- 2. housekeeper: no £, no indicative prices or invoicing, on every page they can reach ----
  await as(p, 'cleaner');
  for (const hsh of [
    'today',
    'changeovers',
    'board',
    'available',
    'free',
    'activity',
    'availability',
    'simple',
    'simple/cleaning',
    'simple/arrivals',
  ]) {
    await go(p, hsh);
    const t = await text(p);
    ok(!/£|indicative|invoic/i.test(t), `${tag}: housekeeper #${hsh} shows no prices`);
    if (hsh === 'availability' && tag === 'desktop')
      await p.screenshot({ path: OUT + 'views-housekeeper-availability.png', fullPage: false });
  }
  await go(p, 'today');
  ok(!(await p.locator('nav button', { hasText: 'Activity' }).count()), `${tag}: housekeeper has no Activity tab`);
  await p.close();
}

// ---- 3. red dot: date change (yes), phone change (no) ----
{
  const p = await pg(1366, 860);
  await as(p, 'client');
  let x = await db(p);
  const st = x.stays.find(s => s.roomId === 'lr-2' && s.departure === D(7));
  // phone change first (Simple mode details card): minor
  await go(p, 'simple/stay/' + st.id);
  await p.click('[data-act="details"]');
  await settle(p);
  await p.fill('input[aria-label="Phone number"]', '07700 900111');
  await p.click('button.s-btn.big[type="submit"]');
  await settle(p, 600);
  x = await db(p);
  ok(x.workers.find(w => w.id === st.workerId).phone === '07700 900111', 'phone change saved');
  ok(!(x.notices ?? []).length, 'phone change: no in-app alert for anyone');
  const mails = x.alerts.length;
  await go(p, 'board');
  await as(p, 'manager');
  ok((await dot(p)) === 0, 'phone change: no red dot for Eshcol');
  ok((await db(p)).alerts.length === mails, 'phone change: no email queued');
  // leaving date change as RJ McLeod (classic panel from the board)
  await as(p, 'client');
  await go(p, 'board');
  await p.locator(`.bar[data-stay="${st.id}"]`).first().click();
  await settle(p);
  await p.fill('#f-dep', uk(D(6)));
  await p.press('#f-dep', 'Tab');
  await p.click('.panel .btn.primary, button.btn.primary >> text=Save');
  await settle(p, 600);
  x = await db(p);
  ok(x.stays.find(s => s.id === st.id).departure === D(6), 'leaving date moved to ' + D(6));
  ok(
    x.notices.some(n => n.forUserId === 'u-donald' && n.reasons.includes('leaving date changed')),
    'date change: alert for Eshcol',
  );
  ok(
    x.notices.some(n => n.forUserId === 'u-mairi'),
    'date change within 7 days: alert for the housekeeper',
  );
  ok(
    x.alerts.length > mails && x.alerts.every(a => a.status !== 'accepted' && a.status !== 'delivered'),
    'email queued, never sent in demo',
  );
  ok((await dot(p)) === 0, 'no red dot for the person who made the change');
  await as(p, 'manager');
  ok((await dot(p)) === 1, 'red dot (1) for Eshcol');
  await p.click('button.bell');
  await settle(p);
  await p.screenshot({ path: OUT + 'views-eshcol-alerts.png' });
  const pop = await p.locator('.bell-pop').innerText();
  ok(/leaving date changed/.test(pop), 'alerts panel says why: leaving date changed');
  // Eshcol activity: sees who did it, tiers, settings
  await p.keyboard.press('Escape');
  await p.mouse.click(5, 300);
  await go(p, 'activity');
  const act = await text(p);
  ok(/Important · leaving date changed/.test(act), 'Eshcol activity: important entry tagged');
  ok(/Sheena/.test(act), 'Eshcol activity keeps per-person attribution');
  ok(/Alert the housekeeper/.test(act) && /6pm summary/.test(act), 'Eshcol alert settings shown');
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: OUT + 'views-eshcol-activity.png' });
  await p.click('.bell');
  await settle(p);
  await p.click('.bell-pop .lnk');
  await settle(p);
  ok((await dot(p)) === 0, 'mark all read clears the red dot');
  await p.mouse.click(5, 300);
  // housekeeper sees their alert
  await as(p, 'cleaner');
  ok((await dot(p)) === 1, 'housekeeper red dot (1)');
  await go(p, 'today');
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: OUT + 'views-housekeeper.png' });

  // ---- 4. RJ McLeod activity: own rooms and bookings only ----
  await p.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k));
    const at = new Date().toISOString();
    d.activity.unshift(
      {
        id: 'q1',
        ts: at,
        userId: 'u-donald',
        text: 'Indicative rate set to £360 per room per week',
        kind: 'rate',
        managerOnly: true,
      },
      {
        id: 'q2',
        ts: at,
        userId: 'u-donald',
        text: '⚠ Possible double booking: Monadh is booked on another booking site',
        kind: 'ical',
        propertyId: 'p-monadh',
      },
      {
        id: 'q3',
        ts: at,
        userId: 'u-mairi',
        text: 'Loch Roag Room 8 clean → Ready (Mairi)',
        kind: 'cleaning',
        propertyId: 'p-lr',
      },
      { id: 'q4', ts: at, userId: 'u-donald', text: 'Housekeeper alerts off', kind: 'settings' },
    );
    localStorage.setItem(k, JSON.stringify(d));
  }, KEY);
  await p.reload();
  await settle(p);
  await as(p, 'client');
  await go(p, 'activity');
  const rj = await p.locator('.act-card').innerText();
  ok(
    !/£|rate|booking site|clean|Mairi|Housekeeper alerts/i.test(rj),
    'RJ activity: no rates, calendar sync, cleaning or cleaner names',
  );
  ok(!PEOPLE.test(rj), 'RJ activity: people shown by role only');
  ok(/leaving/i.test(rj) && /RJ McLeod/.test(rj), 'RJ activity: their own booking change is there');
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: OUT + 'views-rj-activity.png' });
  await go(p, 'board');
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: OUT + 'views-rj-board.png' });
  await as(p, 'manager');
  await go(p, 'activity');
  const own = await p.locator('.act-card').innerText();
  ok(/booking site/.test(own) && /Mairi/.test(own), 'Eshcol activity still shows everything');
  await go(p, 'board');
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: OUT + 'views-eshcol-board.png' });
  await p.close();
}

// ---- 5. phone width: header fits, alerts panel inside the screen ----
{
  const p = await pg(390, 844);
  await as(p, 'client');
  const st = (await db(p)).stays.find(s => s.roomId === 'lr-4' && s.departure === D(5));
  await p.evaluate(
    ({ k, id }) => {
      const d = JSON.parse(localStorage.getItem(k));
      d.notices = [
        {
          id: 'n1',
          ts: new Date().toISOString(),
          forUserId: 'u-donald',
          text: 'Loch Roag Room 4 · test: departure moved',
          reasons: ['leaving date changed'],
          read: false,
          stay: id,
        },
      ];
      localStorage.setItem(k, JSON.stringify(d));
    },
    { k: KEY, id: st?.id },
  );
  await p.reload();
  await settle(p);
  await as(p, 'manager');
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!over, 'phone: no sideways scroll');
  ok((await dot(p)) === 1, 'phone: red dot shown');
  await p.click('button.bell');
  await settle(p);
  const r = await p.locator('.bell-pop').boundingBox();
  ok(r && r.x >= 0 && r.x + r.width <= 390, 'phone: alerts panel fits the screen');
  await p.screenshot({ path: OUT + 'views-phone-alerts.png' });
  await p.mouse.click(5, 600);
  await as(p, 'client');
  const hb = await p.locator('header.top').boundingBox();
  ok(hb && hb.height < 80, 'phone: header stays one row (' + Math.round(hb?.height) + 'px)');
  await go(p, 'activity');
  await p.screenshot({ path: OUT + 'views-phone-rj-activity.png', fullPage: true });
  await p.close();
}

ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
