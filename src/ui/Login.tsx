import { useState } from 'react';
import { data } from '../data';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const send = () => {
    setErr('');
    data.signIn!(email.trim()).then(
      () => setSent(true),
      e => setErr(e.message),
    );
  };
  const verify = () => {
    setErr('');
    setBusy(true);
    data.verifyCode!(email.trim(), code).then(
      () => setBusy(false), // the session change reloads the app
      e => {
        setBusy(false);
        setErr(
          /expired|invalid/i.test(e.message) ? 'That code has expired or is not right. Send a new one.' : e.message,
        );
      },
    );
  };
  return (
    <div
      className="login"
      style={{ backgroundImage: 'linear-gradient(rgba(7,24,47,.82),rgba(7,24,47,.92)),url(img/eshcol-exterior.jpg)' }}
    >
      <div className="lc">
        <span className="mark">LR</span>
        <h1>Eshcol Rooms</h1>
        <p>Loch Roag · Eshcol</p>
        {sent ? (
          <>
            <div className="ok">
              Check your email ({email.trim()}). Tap the sign-in link, or type the 8-digit code from the email here.
            </div>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="8-digit code"
              placeholder="8-digit code"
              maxLength={12}
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && code.replace(/\D/g, '').length === 8 && verify()}
            />
            <button className="btn full" disabled={busy || code.replace(/\D/g, '').length !== 8} onClick={verify}>
              Sign in with code
            </button>
            <button
              className="btn ghost full"
              onClick={() => {
                setSent(false);
                setCode('');
                setErr('');
              }}
            >
              Use a different email or send a new code
            </button>
            {err && <div className="err">{err}</div>}
          </>
        ) : (
          <>
            <input
              type="email"
              aria-label="Email"
              placeholder="you@company.co.uk"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && email.includes('@') && send()}
            />
            <button className="btn full" onClick={send}>
              Email me a sign-in link
            </button>
            {err && <div className="err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
