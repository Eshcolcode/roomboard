import { chromium } from 'playwright';
const U = 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function pg(w, h, user = 'u-eshcol', hash = '') {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(U);
  await p.evaluate(() => {
    localStorage.clear();
    for (const id of ['u-eshcol', 'u-client', 'u-housekeeper']) localStorage.setItem('rb-welcome:' + id, '1');
  });
  await p.reload();
  await p.waitForTimeout(300);
  if (user !== 'u-eshcol') {
    await p.selectOption('select.who', user);
    await p.waitForTimeout(200);
  }
  if (hash) {
    await p.goto(U + '#' + hash);
    await p.waitForTimeout(300);
  }
  return p;
}
const s = async (p, n, full = false) => p.screenshot({ path: `/tmp/look/${n}.png`, fullPage: full });
let p = await pg(390, 844, 'u-housekeeper', 'changeovers');
await s(p, 'ph-cleaner-co', true);
p = await pg(390, 844, 'u-eshcol', 'today');
await s(p, 'ph-today');
p = await pg(390, 844, 'u-client', 'free');
await s(p, 'ph-free', true);
p = await pg(1440, 950, 'u-eshcol', 'activity');
await s(p, 'activity');
p = await pg(1440, 950, 'u-client', 'available');
await s(p, 'available', true);
p = await pg(1440, 950, 'u-eshcol');
await p.keyboard.press('/');
await p.keyboard.type('ro');
await p.waitForTimeout(150);
await s(p, 'search');
p = await pg(1440, 950, 'u-client');
await p.click('.row[data-room="lr-6"] .bar');
await p.click('.panel button:has-text("Cancel stay")');
await p.waitForTimeout(150);
await s(p, 'dialog');
await p.click('.dialog button.red');
await p.waitForTimeout(200);
await s(p, 'toast');
p = await pg(1440, 950, 'u-client', 'board');
await s(p, 'board-client');
await b.close();
