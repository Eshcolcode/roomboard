import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
await p.goto('http://localhost:4173/#board');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(400);
for (const t of ['board', 'changeovers', 'available', 'activity']) {
  await p.goto('http://localhost:4173/#' + t);
  await p.waitForTimeout(300);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(
      v => v.id + ': ' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '')).join(' || '),
    ),
  );
  console.log(t, r);
}
await p.selectOption('select.who', 'u-client');
await p.goto('http://localhost:4173/#activity');
await p.waitForTimeout(300);
const txt = await p.locator('body').innerText();
console.log((txt.match(/.{0,40}(Mairi|cleaner\b).{0,20}/gi) || []).slice(0, 5));
await b.close();
