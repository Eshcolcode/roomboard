// Sign-in screen (Supabase mode), with every auth call intercepted: nothing reaches Supabase and no email is sent.
// Needs a supabase-mode build pointing at a fake project, served on :4180:
//   VITE_DATA_MODE=supabase VITE_SUPABASE_URL=https://fake-project.supabase.co VITE_SUPABASE_ANON_KEY=fake \
//     npx vite build --outDir /tmp/dist-sb && (cd /tmp/dist-sb && python3 -m http.server 4180 &)
//   node qa/login.mjs
import { chromium } from 'playwright';
const U = process.env.LOGIN_URL ?? 'http://localhost:4180/';
const b = await chromium.launch({
  executablePath: process.env.QA_CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
};
for (const [w, h] of [
  [390, 844],
  [1440, 950],
]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const calls = [];
  let verifyOk = false;
  await p.route(/supabase\.co\//, r => {
    const u = r.request().url();
    calls.push({ u, body: r.request().postDataJSON?.() ?? null });
    if (u.includes('/auth/v1/otp')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.includes('/auth/v1/verify'))
      return verifyOk
        ? r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        : r.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }),
          });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await p.goto(U);
  await p.waitForTimeout(800);
  ok(await p.locator('h1:has-text("Eshcol Rooms")').isVisible(), `${w}: sign-in screen says Eshcol Rooms`);
  await p.fill('input[type=email]', 'someone@example.co.uk');
  await p.click('text=Email me a sign-in link');
  await p.waitForTimeout(400);
  const otp = calls.find(c => c.u.includes('/auth/v1/otp'));
  ok(!!otp && otp.body?.create_user === false, `${w}: asks for a link for an existing login only (no sign-up)`);
  ok(await p.locator('.ok:has-text("8-digit code")').isVisible(), `${w}: tells you to tap the link or type the code`);
  ok(await p.locator('button:has-text("Sign in with code")').isDisabled(), `${w}: code button waits for 8 digits`);
  await p.fill('input[aria-label="8-digit code"]', '1234 5678');
  await p.click('button:has-text("Sign in with code")');
  await p.waitForTimeout(400);
  const v = calls.find(c => c.u.includes('/auth/v1/verify'));
  ok(v?.body?.token === '12345678' && v.body.type === 'email', `${w}: code sent for checking (spaces removed)`);
  ok(/expired or is not right/.test(await p.locator('.err').innerText()), `${w}: wrong/expired code explained plainly`);
  await p.click('text=Use a different email or send a new code');
  ok(await p.locator('input[type=email]').isVisible(), `${w}: can go back and send a new code`);
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
