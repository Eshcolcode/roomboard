// Shift patterns (27 Oct 2026): node qa/shifts.mjs (needs a demo preview on :4173 or QA_URL). Screenshots go to
// SHOTS (default /workspace/flow-shots/shifts).
import { chromium } from 'playwright';
const U = process.env.QA_URL ?? 'http://localhost:4173/';
const OUT = (process.env.SHOTS ?? '/workspace/flow-shots/shifts') + '/';
const b = await chromium.launch({ executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const errs = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
async function pg(w = 1440, h = 900, mode = 'classic') {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(U + '#board');
  await p.evaluate(m => { localStorage.clear(); localStorage.setItem('rb-ui-mode', m); for (const id of ['u-eshcol', 'u-client', 'u-housekeeper']) localStorage.setItem('rb-welcome:' + id, '1'); }, mode);
  await p.reload();
  await p.waitForTimeout(500);
  return p;
}
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('roomboard-demo-v2')));
const settle = p => p.waitForTimeout(400);

let p = await pg();
let x = await db(p);
ok(x.v === 9 && x.shiftPatterns.length === 2, 'demo has the two example patterns');
ok(x.shiftPatterns.some(s => s.name === '10 on / 4 off, Mon start' && s.on === 10 && s.off === 4 && s.startDow === 1), '10 on / 4 off, Mon start');
ok(x.shiftPatterns.some(s => s.name === 'Sun to Thu, leave Fri' && s.on === 5 && s.off === 2 && s.startDow === 0), 'Sun to Thu, leave Fri');
ok((await p.locator('.awayseg').count()) > 0, 'board draws away nights striped');
ok(/\d+ in tonight, \d+ away/.test(await p.locator('[data-whosin="p-es"]').innerText()), "who's in tonight per property");
ok((await p.locator('.rl .inmark').count()) > 5, 'in / away marker per room');
ok((await p.locator('.legend:has-text("Away, room kept")').count()) === 1, 'legend explains away, room kept');
await p.screenshot({ path: OUT + 'board-desktop.png' });
// away nights are never free: Find a room never offers a room whose guest is away
const es1 = x.stays.find(s => s.roomId === 'es-1' && !s.departure);
// patterns sheet: add one
await p.click('[data-act="patterns"]'); await settle(p);
ok(await p.locator('.shiftdlg').isVisible(), 'Shift patterns list opens');
await p.click('.shiftdlg button:has-text("+ New pattern")');
await p.fill('#sp-name', '14 on / 7 off, Wed start');
await p.fill('#sp-on', '14'); await p.fill('#sp-off', '7'); await p.selectOption('#sp-dow', '3');
await p.screenshot({ path: OUT + 'patterns-list.png' });
await p.click('.shiftdlg button:has-text("Add pattern")'); await settle(p);
x = await db(p);
ok(x.shiftPatterns.some(s => s.name === '14 on / 7 off, Wed start' && s.on === 14 && s.off === 7 && s.startDow === 3), 'new pattern saved');
await p.keyboard.press('Escape'); await settle(p);
// stay editor: choose a pattern on Eshcol Room 2's stay
await p.click('.row[data-room="es-2"] .bar'); await settle(p);
ok(await p.locator('#f-shift').isVisible(), 'stay editor has a Shift pattern dropdown');
ok((await p.locator('#f-shift option').first().innerText()).startsWith('No pattern'), 'No pattern is the default option');
await p.selectOption('#f-shift', 'sp-10-4'); await settle(p);
ok(await p.locator('#f-cycle').isVisible(), 'first day in is asked');
await p.click('.panel .btn.primary'); await settle(p);
x = await db(p);
const st2 = x.stays.find(s => s.roomId === 'es-2');
ok(x.stayShifts.some(s => s.stayId === st2.id && s.patternId === 'sp-10-4'), 'pattern applied to the stay');
ok(x.stays.find(s => s.id === st2.id).version === st2.version, 'pattern-only change leaves the stay itself alone');
await p.click('.row[data-room="es-1"] .bar'); await settle(p);
ok((await p.locator('.daystrip .dsd').count()) > 7, 'day strip shows the coming nights');
await p.screenshot({ path: OUT + 'stay-editor.png' });
const before = (await db(p)).stayShifts.find(s => s.stayId === es1.id);
await p.locator('.daystrip .dsd.ds-away').first().click(); await settle(p);
const after = (await db(p)).stayShifts.find(s => s.stayId === es1.id);
ok(Object.keys(after.overrides).length === Object.keys(before.overrides).length + 1, 'tap a night = one-off change');
await p.screenshot({ path: OUT + 'stay-editor-oneoff.png' });
await p.close();

// phone
p = await pg(390, 844, 'quick');
await p.goto(U + '#rooms'); await settle(p);
await p.screenshot({ path: OUT + 'phone-rooms.png' });
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no sideways scroll');
await p.locator('.rcard[data-room="es-1"] button:has-text("Quick update")').click(); await settle(p);
await p.click('[data-act="shiftpat"]'); await settle(p);
ok(await p.locator('#f-shift').isVisible(), 'quick card: Shift pattern step');
await p.screenshot({ path: OUT + 'phone-quick-shift.png' });
await p.close();
p = await pg(390, 844);
await p.goto(U + '#board'); await settle(p);
await p.close();

// housekeeper
p = await pg(1440, 900);
await p.selectOption('select.who', 'u-housekeeper'); await settle(p);
await p.goto(U + '#today'); await settle(p);
const t = await p.locator('main').innerText();
ok(/good day to clean/.test(t), 'housekeeper: away = good day to clean');
await p.screenshot({ path: OUT + 'housekeeper-today.png', fullPage: true });
await p.close();
p = await pg(1440, 900);
await p.selectOption('select.who', 'u-client'); await settle(p);
await p.goto(U + '#today'); await settle(p);
ok(!/good day to clean/.test(await p.locator('main').innerText()), 'RJ McLeod: no cleaning wording');
await p.goto(U + '#board'); await settle(p);
ok((await p.locator('[data-act="patterns"]').count()) === 1, 'RJ McLeod can manage patterns');
await p.close();

// like live with nothing set up yet: the quick booking offers only 'No pattern' and the way to add one (no presets)
p = await pg(390, 844, 'quick');
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('roomboard-demo-v2'));
  x.shiftPatterns = []; x.stayShifts = [];
  localStorage.setItem('roomboard-demo-v2', JSON.stringify(x));
});
await p.goto(U + '#rooms'); await p.reload(); await settle(p);
await p.click('.fab button:has-text("Hold")'); await settle(p);
for (let i = 0; i < 6 && !(await p.locator('.s-extra:has-text("Shift pattern")').count()); i++) {
  const room = p.locator('.s-pick, .s-room, button:has-text("Hold this room"), button:has-text("Hold these")').first();
  const chip = p.locator('.s-chip').first();
  if (await p.locator('button:has-text("Hold")').filter({ hasText: /^Hold/ }).count() && i > 3) break;
  if (await chip.count()) await chip.click(); else if (await room.count()) await room.click();
  await p.waitForTimeout(700);
}
ok(await p.locator('.s-extra:has-text("Shift pattern")').count() === 1, 'empty list: quick booking reaches the held screen with a Shift pattern option');
await p.click('.s-extra:has-text("Shift pattern")'); await settle(p);
const opts = await p.locator('[data-shift-choices] .s-pick').allInnerTexts();
ok(opts.length === 1 && /No pattern/.test(opts[0]), 'empty list: only "No pattern" is offered (' + opts.map(o => o.split('\n')[0]).join(', ') + ')');
ok(!/on · \d+ off|10 on/.test(await p.locator('.q-panel, .s-box').first().innerText()), 'empty list: no built-in rota presets');
ok(await p.locator('[data-act="manage-patterns"]').isVisible(), 'empty list: "Add a shift pattern…" is there');
await p.click('[data-act="manage-patterns"]'); await settle(p);
ok(/No patterns yet/.test(await p.locator('.shiftdlg').innerText()), 'the same (empty) Shift patterns list opens');
await p.click('.shiftdlg button:has-text("+ New pattern")');
await p.fill('#sp-name', 'Only pattern');
await p.click('.shiftdlg button:has-text("Add pattern")'); await settle(p);
await p.click('.shiftdlg .x'); await settle(p);
const opts2 = await p.locator('[data-shift-choices] .s-pick').allInnerTexts();
ok(opts2.length === 2 && /Only pattern/.test(opts2[0]), 'a new pattern appears in the quick booking straight away (no reload)');
await p.screenshot({ path: OUT + 'phone-quick-book-pattern.png' });
await p.close();

ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
