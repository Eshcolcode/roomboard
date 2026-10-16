// Quick visual review: node qa/look.mjs  → /tmp/look/*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/look', { recursive: true });
const U = 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function pg(w, h, user = 'u-donald', welcome = false) {
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U);
  await p.evaluate(
    ([u, wl]) => {
      localStorage.clear();
      if (!wl) for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
    },
    [user, welcome],
  );
  await p.reload();
  await p.waitForTimeout(300);
  if (user !== 'u-donald') {
    await p.selectOption('select.who', user);
    await p.waitForTimeout(200);
  }
  return p;
}
const shots = process.argv.slice(2);
const want = n => !shots.length || shots.includes(n);
if (want('board')) {
  const p = await pg(1440, 950);
  await p.goto(U + '#board');
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/look/board.png' });
}
if (want('panel')) {
  const p = await pg(1440, 950);
  await p.click('.row[data-room="lr-6"] .bar');
  await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/look/panel.png' });
}
if (want('free')) {
  const p = await pg(1440, 950, 'u-client');
  await p.goto(U + '#free');
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/look/free.png', fullPage: true });
}
if (want('phone')) {
  const p = await pg(390, 844, 'u-client');
  await p.screenshot({ path: '/tmp/look/phone-rooms.png', fullPage: true });
}
if (want('phonepanel')) {
  const p = await pg(390, 844);
  await p.click('.fab .btn:not(.ghost)');
  await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/look/phone-panel.png' });
}
if (want('co')) {
  const p = await pg(1440, 950);
  await p.goto(U + '#changeovers');
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/look/co.png', fullPage: true });
}
if (want('print')) {
  const p = await pg(1100, 900);
  await p.goto(U + '#print-cleaning');
  await p.waitForTimeout(300);
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: '/tmp/look/print.png', fullPage: true });
}
if (want('welcome')) {
  const p = await pg(1440, 950, 'u-donald', true);
  await p.screenshot({ path: '/tmp/look/welcome.png' });
}
if (want('w900')) {
  const p = await pg(900, 800);
  await p.screenshot({ path: '/tmp/look/w900.png' });
}
console.log(errs.join('\n') || 'no errors');
await b.close();
