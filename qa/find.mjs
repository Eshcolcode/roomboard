// Find a room with the extra properties: node qa/find.mjs (preview on :4173 or QA_URL). Targeted check.
// Screens go to SHOTS (default /workspace/flow-shots) as find-*.png.
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
const settle = p => p.waitForTimeout(400);
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
async function pg(w, h, { user = 'u-client', mode = 'quick' } = {}) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#free');
  await p.evaluate(
    ({ m }) => {
      localStorage.clear();
      for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
      localStorage.setItem('rb-ui-mode', m);
    },
    { m: mode },
  );
  await p.reload();
  await settle(p);
  if (user !== 'u-donald') {
    await p.selectOption('select.who', user);
    await settle(p);
  }
  await p.evaluate(() => (location.hash = 'free'));
  await settle(p);
  return p;
}
const dates = async (p, a, d) => {
  await p.fill('#fr-from', uk(a));
  await p.fill('#fr-to', uk(d));
  await settle(p);
};
// D(28)..D(31): Monadh's demo calendar is booked 16–19 Nov 2026 (dates relative to 19 Oct 2026)
const A = D(28),
  Z = D(31);
const cards = p =>
  p
    .locator('.freeextra')
    .evaluateAll(es =>
      es.map(e => ({ id: e.getAttribute('data-extra'), off: e.classList.contains('off'), t: e.innerText })),
    );

// ---- Sheena, Quick, desktop ----
let p = await pg(1440, 950);
await dates(p, A, Z);
let c = await cards(p);
ok(
  c.map(x => x.id).join() === 'p-pod1,p-pod2,p-monadh,p-cottage',
  'extras listed after the contract houses, board order: Harris, Uig, Monadh, Abhainn',
);
const secs = await p.locator('main section[aria-label]').evaluateAll(es => es.map(e => e.getAttribute('aria-label')));
ok(
  secs.join('|') === 'Free at Eshcol Worker Accommodation|Free at Loch Roag Guest House|Extra properties free',
  'sections: Eshcol, Loch Roag, then Extra properties',
);
ok(
  c.find(x => x.id === 'p-monadh').off && /Not free/.test(c.find(x => x.id === 'p-monadh').t),
  'Monadh taken (calendar block) → not bookable, no reason or name',
);
const h = c.find(x => x.id === 'p-pod1');
ok(
  !h.off && h.t.includes('Indicative £150') && h.t.includes('3 nights') && h.t.includes('1 room charged'),
  'Harris: indicative £150 for 3 nights, 1 room charged',
);
const ab = c.find(x => x.id === 'p-cottage');
ab.off ||
  ok(
    ab.t.includes('Indicative £300') && ab.t.includes('2 rooms charged'),
    'Abhainn: charged as 2 rooms (£300 / 3 nights)',
  );
const contractTxt = await p
  .locator('section[aria-label^="Free at"]')
  .evaluateAll(es => es.map(e => e.innerText).join(' '));
ok(!/£|indicative/i.test(contractTxt), 'no price anywhere on the contract houses');
const sum = await p.locator('.finder .summary').innerText();
const nx = c.filter(x => !x.off).length;
ok(
  new RegExp(`rooms? free · ${nx} extra propert`).test(sum) && sum.includes('3 nights'),
  'summary counts rooms and extra properties: ' + sum,
);
{
  const x = await db(p);
  const names = [...x.workers.map(w => w.name), ...x.stays.map(s => s.holdLabel).filter(Boolean)];
  const t = await p.locator('section.xfree').innerText();
  ok(
    !names.some(n => n && n.length > 3 && t.includes(n)) && !/elsewhere|airbnb|booking\.com/i.test(t),
    'extras section names nobody and no other site',
  );
}
await p.screenshot({ path: '/workspace/find-a-room-extras-desktop.png', fullPage: true });
await p.screenshot({ path: OUT + 'find-desktop.png', fullPage: true });
// bathroom filter
await p.selectOption('#fr-bath', 'ensuite');
await settle(p);
ok((await p.locator('.freeextra').count()) === 4, 'Ensuite only: extras still shown (own bathrooms)');
await p.selectOption('#fr-bath', 'shared');
await settle(p);
ok(
  (await p.locator('.freeextra').count()) === 0 &&
    !/extra propert/.test(await p.locator('.finder .summary').innerText()),
  'Shared shower room: extras left out (nothing shared there)',
);
await p.selectOption('#fr-bath', 'any');
await settle(p);
// open-ended
await p.check('.finder input[type=checkbox]');
await settle(p);
c = await cards(p);
ok(c.find(x => x.id === 'p-monadh').off, 'until further notice: Monadh not free (later nights taken)');
const fh = c.find(x => !x.off);
ok(!fh || /Indicative £\d+.*a week/s.test(fh.t), 'until further notice: weekly price');
await p.uncheck('.finder input[type=checkbox]');
await settle(p);
// Book → the same extras booking flow, dates prefilled; picker from the workers list
await p.click('.freeextra[data-extra="p-pod1"]');
await settle(p);
const q = p.locator('.q-panel');
ok(
  await q.locator('input[aria-label="Name"]').isVisible(),
  'Book → Quick "Who is staying?" with the name box / workers list',
);
const w = (await db(p)).workers[0].name;
await q.locator('input[aria-label="Name"]').fill(w.split(' ')[0]);
await q.locator(`.s-pick:has-text("${w}")`).first().click();
await settle(p);
let st = (await db(p)).stays.find(s => s.roomId === 'x-pod1' && s.arrival === A);
ok(!!st && st.departure === Z && !!st.workerId, `booked Harris ${A} → ${Z} for ${w}`);
ok(/phone/i.test(await q.innerText()), 'booked card offers phone / notes');
await p.keyboard.press('Escape');
await settle(p);
await p.evaluate(() => (location.hash = 'free'));
await settle(p);
await dates(p, A, Z);
c = await cards(p);
ok(c.find(x => x.id === 'p-pod1').off, 'after booking: Harris no longer free for those dates');
await p.close();

// ---- Classic: Book → stay form prefilled ----
p = await pg(1440, 950, { user: 'u-donald', mode: 'classic' });
await dates(p, A, Z);
const free1 = (await cards(p)).find(x => !x.off);
await p.click(`.freeextra[data-extra="${free1.id}"]`);
await settle(p);
ok(
  (await p.locator('aside.panel').count()) === 1 &&
    (await p.locator('#f-arr').inputValue()) === uk(A) &&
    (await p.locator('#f-dep').inputValue()) === uk(Z),
  'Classic: Book → stay form with the dates prefilled',
);
await p.close();

// ---- phone ----
p = await pg(390, 844);
await dates(p, A, Z);
const lay = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const r = [...document.querySelectorAll('.freeextra')].map(e => e.getBoundingClientRect());
  return {
    over: document.documentElement.scrollWidth > vw + 1,
    fit: r.every(x => x.left >= 0 && x.right <= vw + 1),
    one: new Set(r.map(x => Math.round(x.left))).size === 1,
    n: r.length,
    minH: Math.min(...r.map(x => x.height)),
  };
});
ok(
  lay.n === 4 && !lay.over && lay.fit && lay.one && lay.minH >= 44,
  'phone: 4 full-width extras cards, no sideways scroll, big enough to tap',
);
await p.locator('section.xfree').scrollIntoViewIfNeeded();
await p.screenshot({ path: OUT + 'find-phone.png', fullPage: true });
await p.close();

ok(!errs.length, 'no console errors ' + errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
