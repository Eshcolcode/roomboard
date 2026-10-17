// Regenerates screens/*.png from the local production build: node qa/screens.mjs
import { chromium } from 'playwright';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = new URL('../screens/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function pg(w, h, user = 'u-donald', hash = '', scale = 2) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.addInitScript(() => { if (!localStorage.getItem('rb-ui-mode')) localStorage.setItem('rb-ui-mode', 'classic'); });
  await p.goto(U); await p.evaluate(() => { localStorage.clear(); for (const id of ['u-donald', 'u-client', 'u-mairi']) localStorage.setItem('rb-welcome:' + id, '1'); });
  await p.reload(); await p.waitForTimeout(300);
  if (user !== 'u-donald') { await p.selectOption('select.who', user); await p.waitForTimeout(200); }
  if (hash) { await p.goto(U + '#' + hash); await p.waitForTimeout(300); }
  return p;
}
const shot = (p, n, o = {}) => p.screenshot({ path: OUT + n + '.png', ...o });
let p = await pg(1440, 950); await shot(p, 'board');
p = await pg(900, 800); await shot(p, 'board-900');
p = await pg(1440, 950, 'u-client'); await shot(p, 'board-client');
p = await pg(1440, 950, 'u-client', 'free'); await p.locator('#fr-from').fill(new Date(Date.now() + 864e5).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }));
await p.locator('#fr-to').fill(new Date(Date.now() + 4 * 864e5).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })); await p.waitForTimeout(200); await shot(p, 'free-rooms');
p = await pg(390, 844, 'u-client', 'free', 3); await shot(p, 'free-rooms-phone');
p = await pg(390, 844, 'u-client', '', 3); await shot(p, 'rooms-phone-sheena'); await shot(p, 'rooms-phone-sheena-full', { fullPage: true });
p = await pg(390, 844, 'u-donald', '', 3); await p.click('.fab .btn:not(.ghost)'); await p.waitForTimeout(300); await shot(p, 'add-stay-phone');
p = await pg(1440, 950); await p.click('.row[data-room="lr-6"] .bar'); await p.waitForTimeout(300); await shot(p, 'edit-stay');
p = await pg(1440, 950, 'u-donald', 'changeovers'); await shot(p, 'cleaning');
p = await pg(1440, 950, 'u-donald', 'today'); await shot(p, 'today');
p = await pg(1440, 950, 'u-client', 'available'); await shot(p, 'more-rooms');
p = await pg(1440, 950, 'u-donald', 'activity'); await shot(p, 'activity');
p = await pg(1440, 950); await p.keyboard.press('/'); await p.waitForTimeout(200); await p.keyboard.type('Room 8'); await p.waitForTimeout(200); await shot(p, 'search');
p = await pg(1440, 950); await p.click('.row[data-room="lr-6"] .bar'); await p.click('.panel button:has-text("Cancel stay")'); await p.waitForTimeout(200); await shot(p, 'confirm-cancel');
await p.click('.dialog button.red'); await p.waitForTimeout(300); await shot(p, 'undo-toast');
for (const k of ['today', 'cleaning']) { p = await pg(1000, 1300, 'u-donald', 'print-' + k); await p.emulateMedia({ media: 'print' }); await shot(p, 'print-' + k); }
p = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 }); await p.goto(U); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400); await shot(p, 'welcome');
await b.close(); console.log('screens written to', OUT);
