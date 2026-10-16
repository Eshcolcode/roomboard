import { useState } from 'react';
import { data } from '../data';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div
      className="login"
      style={{ backgroundImage: 'linear-gradient(rgba(7,24,47,.82),rgba(7,24,47,.92)),url(img/eshcol-exterior.jpg)' }}
    >
      <div className="lc">
        <span className="mark">LR</span>
        <h1>Roomboard</h1>
        <p>Loch Roag · Eshcol Worker Accommodation</p>
        {sent ? (
          <div className="ok">Check your email for a sign-in link.</div>
        ) : (
          <>
            <input
              type="email"
              aria-label="Email"
              placeholder="you@company.co.uk"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button
              className="btn full"
              onClick={() =>
                data.signIn!(email).then(
                  () => setSent(true),
                  e => setErr(e.message),
                )
              }
            >
              Email me a sign-in link
            </button>
            {err && <div className="err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
