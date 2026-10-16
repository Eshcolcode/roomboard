import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
const U = 'http://localhost:4173/'; const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
await p.goto(U + '#board'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.bar');
ok(await p.locator('.grp:has-text("Loch Roag")').count() === 1 && await p.locator('.rl').count() === 19, '19 contracted rooms (LR 9 + Eshcol 10)');
ok(await p.locator('.bar.dep:has-text("Neil Mackenzie")').count() === 1, 'Room 8 departing today');
await p.goto(U + '#changeovers'); ok(await p.locator('.col:has-text("Scheduled") .cc:has-text("Loch Roag Room 8")').count() === 1, 'Room 8 changeover scheduled');
// bring hold forward -> invalidates
await p.goto(U + '#board'); await p.click('.bar.hold:has-text("electrician")');
await p.fill('.panel input[type=date] >> nth=0', '2026-10-19'); await p.click('.panel .btn:has-text("Save changes")'); await p.waitForTimeout(300);
await p.goto(U + '#changeovers'); ok(await p.locator('.col:has-text("Needs scheduling") .cc:has-text("Loch Roag Room 8") .inv').count() === 1, 'arrival brought forward resets changeover');
// name the hold
await p.goto(U + '#board'); const before = await p.locator('.bar').count(); await p.click('.bar.hold:has-text("electrician")');
await p.click('.panel .seg button:has-text("Named worker")'); await p.click('.panel .chip >> nth=1'); await p.click('.panel .btn:has-text("Save changes")'); await p.waitForTimeout(300);
ok(await p.locator('.bar').count() === before && await p.locator('.bar.hold:has-text("electrician")').count() === 0, 'naming hold updates same record');
// clash
await p.click('text=+ Add stay'); await p.click('.panel .chip >> nth=0'); await p.selectOption('.panel select', 'lr-1');
ok(await p.locator('.panel .err:has-text("Clashes")').count() === 1 && await p.locator('.panel .btn:has-text("Add stay")').isDisabled(), 'overlap blocked');
await p.click('.panel button:has-text("Close")');
await p.goto(U + '#activity'); await p.waitForTimeout(6000);
ok(await p.locator('.act:has-text("named hold")').count() >= 1, 'activity log entry'); ok(await p.locator('.al .t-sent').count() > 0, 'alerts sent from outbox');
// cleaner
await p.selectOption('select.who', 'u-mairi'); await p.waitForTimeout(200);
ok(await p.locator('nav a').count() === 2, 'cleaner sees Today + Changeovers only');
console.log('errors', errs); await b.close();
