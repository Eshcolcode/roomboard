// v2 visual review: node qa/look3.mjs [names] → /tmp/look/*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/look', { recursive: true });
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? '/tmp/look';
const b = await chromium.launch({
  executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const errs = [];
async function pg(w, h, user = 'u-donald', mobile = false) {
  const c = await b.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U);
  await p.evaluate(() => {
    localStorage.clear();
    for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1');
  });
  await p.reload();
  await p.waitForTimeout(300);
  if (user !== 'u-donald') {
    await p.selectOption('select.who', user);
    await p.waitForTimeout(200);
  }
  return p;
}
const want = n => process.argv.length < 3 || process.argv.slice(2).includes(n);
if (want('rooms')) {
  const p = await pg(1440, 1000, 'u-client');
  await p.goto(U + '#rooms');
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/v2-rooms-desktop.png' });
}
if (want('board')) {
  const p = await pg(1440, 900);
  await p.goto(U + '#board');
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/v2-board.png' });
}
if (want('drag')) {
  const p = await pg(1440, 900);
  await p.goto(U + '#board');
  await p.waitForTimeout(300);
  const bar = p.locator('.row[data-room="lr-6"] .bar').first();
  const bb = await bar.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x + 90, bb.y + bb.height / 2, { steps: 5 });
  await p.mouse.move(bb.x + 150, bb.y + bb.height / 2 - 31, { steps: 5 });
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/v2-board-drag.png' });
  await p.mouse.up();
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/v2-board-drag-confirm.png' });
}
if (want('crew')) {
  const p = await pg(1440, 1000, 'u-client');
  await p.goto(U + '#crew');
  await p.waitForTimeout(300);
  await p.fill('#c-label', 'RJ McLeod night crew');
  const boxes = p.locator('.wpick input[type=checkbox]');
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await p.fill('#c-holds', '5');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/v2-crew-preview.png', fullPage: true });
}
if (want('phone')) {
  const p = await pg(390, 844, 'u-client', true);
  await p.goto(U + '#rooms');
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/v2-phone-rooms.png' });
}
if (want('phonemgr')) {
  const p = await pg(390, 844, 'u-donald', true);
  await p.goto(U + '#rooms');
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/v2-phone-rooms-manager.png' });
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
