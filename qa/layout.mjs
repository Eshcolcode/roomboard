// Layout sanity across every route, at 1440 and 390, for Donald, Sheena and the cleaner, plus the overlay states
// (book-in-place sheet, photo viewer, quick card). Fails on: horizontal page scroll, elements spilling off the
// screen outside a scroll container, form controls / text blocks taller than half the screen (the "Who is
// staying?" box bug), images taller than the screen, and console errors. node qa/layout.mjs (preview on :4173 or
// QA_URL). Screens go to SHOTS/layout (default /workspace/flow-shots/layout).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = (process.env.SHOTS ?? '/workspace/flow-shots') + '/layout/';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  if (!c) console.log('FAIL ' + m);
};
const ROUTES = [
  'board',
  'rooms',
  'crew',
  'free',
  'today',
  'changeovers',
  'workers',
  'activity',
  'available',
  'available/p-es',
  'available/p-lr',
  'available/p-pod1',
  'available/p-pod2',
  'available/p-monadh',
  'available/p-cottage',
  'availability',
  'availability/p-monadh',
  'simple',
  'print-today',
  'print-cleaning',
];
const USERS = { donald: 'u-donald', sheena: 'u-client', cleaner: 'u-mairi' };
const SIZES = { desk: [1440, 950], phone: [390, 844] };

async function scan(p) {
  return p.evaluate(() => {
    const W = innerWidth,
      H = innerHeight,
      out = [];
    const scrolls = el => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o !== 'visible') return true;
      }
      return false;
    };
    const name = el =>
      el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '');
    const hs = document.documentElement.scrollWidth - W;
    if (hs > 1) out.push(`page scrolls sideways by ${hs}px`);
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (cs.position === 'fixed' && el.closest('.toasts')))
        continue;
      const rc = el.getBoundingClientRect();
      if (!rc.width || !rc.height) continue;
      if ((rc.right > W + 2 || rc.left < -2) && !scrolls(el) && cs.position !== 'fixed')
        out.push(`off screen: ${name(el)} (${Math.round(rc.left)}→${Math.round(rc.right)})`);
      const tag = el.tagName;
      if (
        /^(INPUT|SELECT|TEXTAREA|BUTTON|LABEL|P|H1|H2|H3|LI|SPAN|SMALL|B)$/.test(tag) &&
        rc.height > Math.max(300, H * 0.5) &&
        !el.closest('.lb, .print, .xs-body, .av-months, .board, .scroll')
      )
        out.push(`too tall: ${name(el)} ${Math.round(rc.height)}px`);
      if (tag === 'IMG' && rc.height > H * 0.95 && !el.closest('.lb'))
        out.push(`image taller than screen: ${name(el)} ${Math.round(rc.height)}px`);
    }
    return [...new Set(out)].slice(0, 12);
  });
}
async function audit(p, tag) {
  const r = await scan(p);
  ok(!r.length, `${tag}: ${r.join(' | ')}`);
  return r;
}

// the checker itself: it must catch the old "Who is staying?" bug (a 100vh-tall name box) and a sideways spill
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(U + '#available/p-pod2');
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rb-welcome:u-donald', '1');
  });
  await p.reload();
  await p.waitForTimeout(400);
  await p.locator('.av-d.s-free:not([disabled])').nth(2).click();
  await p.locator('.av-d.s-free:not([disabled])').nth(4).click();
  await p.waitForTimeout(200);
  ok(await p.locator('.av-step button').first().isVisible(), 'self-test: the booking bar is showing');
  ok(!(await scan(p)).length, 'self-test: clean page passes');
  await p.addStyleTag({ content: '.av-step button{min-height:100vh}' });
  const r1 = await scan(p);
  ok(
    r1.some(x => /too tall: button/.test(x)),
    'self-test: catches a screen-tall button (' + r1[0] + ')',
  );
  await p.addStyleTag({ content: '.av-step button{min-height:44px} .pp-head{width:900px}' });
  const r2 = await scan(p);
  ok(
    r2.some(x => /sideways/.test(x)),
    'self-test: catches sideways scroll (' + r2[0] + ')',
  );
  await p.close();
}

if (process.env.SELFTEST_ONLY) {
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
}
let shots = 0;
for (const [sz, [w, h]] of Object.entries(SIZES))
  for (const [who, id] of Object.entries(USERS)) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(U + '#board');
    await p.evaluate(u => {
      localStorage.clear();
      for (const x of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + x, '1');
      localStorage.setItem('rb-demo-user', u);
    }, id);
    await p.reload();
    await p.waitForTimeout(400);
    if (id !== 'u-donald') {
      const sel = (await p.locator('select.who').count()) ? 'select.who' : 'select.s-who';
      if (await p.locator(sel).count()) await p.selectOption(sel, id);
      await p.waitForTimeout(300);
    }
    for (const rt of ROUTES) {
      await p.goto(U + '#' + rt);
      await p.waitForTimeout(350);
      await p.evaluate(() => scrollTo(0, 0));
      const tag = `${sz} ${who} #${rt}`;
      await audit(p, tag);
      await p.screenshot({ path: OUT + `${sz}-${who}-${rt.replace(/\//g, '_')}.png`, fullPage: true });
      shots++;
      if (rt.startsWith('print-') || rt.startsWith('simple')) {
        await p.goto(U + '#board');
        await p.waitForTimeout(300);
      }
    }
    // overlay states
    if (who !== 'cleaner') {
      await p.goto(U + (sz === 'desk' ? '#board' : '#rooms'));
      await p.waitForTimeout(400);
      if (sz === 'desk') {
        const tr = await p.locator('[data-extra="p-pod2"] .track').boundingBox();
        await p.locator('[data-extra="p-pod2"]').scrollIntoViewIfNeeded();
        const t2 = await p.locator('[data-extra="p-pod2"] .track').boundingBox();
        await p.mouse.click(Math.min(t2.x + t2.width, w) - 30, t2.y + t2.height / 2);
      } else {
        await p.locator('.xcard[data-extra="p-pod2"] .xbtns .btn.primary').click();
      }
      await p.waitForTimeout(400);
      ok(await p.locator('.xs').isVisible(), `${sz} ${who}: book-in-place sheet opens`);
      await audit(p, `${sz} ${who} sheet`);
      await p.screenshot({ path: OUT + `${sz}-${who}-state-sheet.png` });
      await p.keyboard.press('Escape');
      await p.goto(U + '#available/p-lr');
      await p.waitForTimeout(400);
      await p.locator('.pp-mainbtn').click();
      await p.waitForTimeout(300);
      await audit(p, `${sz} ${who} photo viewer`);
      await p.screenshot({ path: OUT + `${sz}-${who}-state-lightbox.png` });
      await p.keyboard.press('Escape');
      shots += 2;
      // quick card: a contract booking, and (Donald) an extra booking with its price and end-date box
      await p.goto(U + (sz === 'desk' ? '#board' : '#rooms'));
      await p.waitForTimeout(400);
      const sels =
        sz === 'desk'
          ? ['.track .bar:not(.xbar)', ...(who === 'donald' ? ['[data-extra="p-cottage"] .xbar'] : [])]
          : [
              '.rcard button:has-text("Quick update")',
              ...(who === 'donald' ? ['.xcard[data-extra="p-cottage"] .xbtns .btn.ghost'] : []),
            ];
      for (const sel of sels) {
        const bar = p.locator(sel).first();
        if (!(await bar.count())) {
          console.log(`(no ${sel} for ${sz} ${who})`);
          continue;
        }
        await bar.scrollIntoViewIfNeeded();
        await bar.click(sz === 'desk' ? { position: { x: 12, y: 8 } } : {});
        await p.waitForTimeout(400);
        const open = await p.locator('.q-bar').isVisible();
        ok(open, `${sz} ${who}: quick card opens from ${sel}`);
        await audit(p, `${sz} ${who} quick card ${sel}`);
        await p.screenshot({ path: OUT + `${sz}-${who}-state-quick${sel.includes('cottage') ? '-extra' : ''}.png` });
        if (open) await p.locator('.q-x').click();
        await p.waitForTimeout(300);
        shots++;
      }
    }
    ok(!errs.length, `${sz} ${who}: console errors: ${errs.join(' | ')}`);
    await p.close();
  }
console.log(`${shots} screens · ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
