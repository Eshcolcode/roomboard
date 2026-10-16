// Other properties from the same team, framed as an enquiry (never shown as bookable).
import { useState } from 'react';
import { data, useDB, me, propOf } from '../data';
import { addDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { toast } from './overlays';

const ART: Record<string, string> = {
  'p-pod1': 'pod',
  'p-pod2': 'pod',
  'p-lodge': 'lodge',
  'p-cottage': 'cottage',
  'p-monadh': 'lodge',
};

export function Available() {
  const db = useDB();
  const T = londonToday();
  const [req, setReq] = useState<string | null>(null);
  const [form, setForm] = useState({ from: addDays(T, 3), to: addDays(T, 17), longTerm: false, people: 1, note: '' });
  const [sent, setSent] = useState<string | null>(null);
  const [rerr, setRerr] = useState('');
  const others = db.properties.filter(p => !p.contracted);
  const brands = [...new Set(others.map(p => p.brand ?? 'Other'))];

  const send = (id: string, name: string) =>
    data
      .addEnquiry({
        propertyId: id,
        from: form.from,
        to: form.longTerm ? null : form.to,
        longTerm: form.longTerm,
        people: form.people,
        note: form.note,
      })
      .then(
        () => {
          setSent(
            `${name} · ${form.people} ${form.people === 1 ? 'person' : 'people'} · ${fmt(form.from)}${form.longTerm ? ' (long-term)' : ' → ' + fmt(form.to)}`,
          );
          setReq(null);
          setRerr('');
          toast('Enquiry sent');
        },
        e => setRerr((e as Error).message),
      );

  return (
    <div className="page">
      <div
        className="hero"
        style={{
          backgroundImage: 'linear-gradient(90deg,rgba(7,24,47,.92),rgba(7,24,47,.55)),url(img/eshcol-exterior.jpg)',
        }}
      >
        <small>Need more rooms?</small>
        <h1>More rooms on Lewis</h1>
        <p>
          Hebridean Holiday Cabins and Whitefalls Spa Lodges, run by the same team. Send an enquiry for your dates and
          Donald will confirm what can be offered.
        </p>
      </div>
      {sent && (
        <div className="ok" role="status">
          ✓ Enquiry sent: {sent}. This is not a booking yet. Donald will confirm by email, usually the same day.
        </div>
      )}
      {brands.map(brand => {
        const list = others.filter(p => (p.brand ?? 'Other') === brand);
        return (
          <div key={brand}>
            <h2 className="brandh">
              {brand}
              <small>
                {list.length} {list.length === 1 ? 'unit' : 'units'} · subject to confirmation
              </small>
            </h2>
            <div className="cards">
              {list.map(p => (
                <div className="ucard" key={p.id}>
                  <div className={'art art-' + ART[p.id]}>
                    <span>{p.beds}</span>
                    <em>Photos to follow</em>
                  </div>
                  <div className="ub">
                    <h3>{p.name}</h3>
                    <p>{p.blurb}</p>
                    <div className="feat">
                      {p.features.map(f => (
                        <span key={f}>{f}</span>
                      ))}
                    </div>
                    <div className="avl">Enquire for your dates · subject to confirmation</div>
                    {req === p.id ? (
                      <div className="rq">
                        <div className="two">
                          <div className="fs">
                            <label htmlFor={'rq-f-' + p.id}>From</label>
                            <DateField
                              id={'rq-f-' + p.id}
                              value={form.from}
                              onChange={v => setForm({ ...form, from: v })}
                            />
                          </div>
                          <div className="fs">
                            <label htmlFor={'rq-t-' + p.id}>To</label>
                            <DateField
                              id={'rq-t-' + p.id}
                              value={form.to}
                              disabled={form.longTerm}
                              onChange={v => setForm({ ...form, to: v })}
                            />
                          </div>
                        </div>
                        <label className="cb">
                          <input
                            type="checkbox"
                            checked={form.longTerm}
                            onChange={e => setForm({ ...form, longTerm: e.target.checked })}
                          />{' '}
                          Long-term / until further notice
                        </label>
                        <label>
                          People
                          <input
                            type="number"
                            min={1}
                            value={form.people}
                            onChange={e => setForm({ ...form, people: +e.target.value })}
                          />
                        </label>
                        <textarea
                          rows={2}
                          aria-label="Note"
                          placeholder="Anything we should know?"
                          value={form.note}
                          onChange={e => setForm({ ...form, note: e.target.value })}
                        />
                        <div className="pa">
                          <button className="link" onClick={() => setReq(null)}>
                            Cancel
                          </button>
                          <div className="sp" />
                          <button className="btn" onClick={() => send(p.id, p.name)}>
                            Send enquiry
                          </button>
                        </div>
                        {rerr && (
                          <div className="err" role="alert">
                            {rerr}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button className="btn full" onClick={() => setReq(p.id)}>
                        Enquire about dates
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {me().role === 'manager' && (
        <section className="card">
          <h3>Enquiries received</h3>
          {db.enquiries.length ? (
            db.enquiries.map(e => (
              <div className="li" key={e.id}>
                <span className="tag t-new">New</span>
                <div>
                  <b>
                    {propOf(e.propertyId).name} · {e.people} {e.people === 1 ? 'person' : 'people'}
                  </b>
                  <small>
                    From {fmt(e.from)} {e.longTerm ? '· long-term' : e.to ? '→ ' + fmt(e.to) : ''}{' '}
                    {e.note && '· ' + e.note}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">No enquiries yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
