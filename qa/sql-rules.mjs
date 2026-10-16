// Runs rules/cases.json against the SQL rule functions (0006) in a local Postgres.
// Usage: node qa/sql-rules.mjs  (expects PGHOST/PGPORT/PGDATABASE pointing at a DB with the migrations applied)
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
const C = JSON.parse(readFileSync(new URL('../rules/cases.json', import.meta.url)));
const q = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const d = v => `${q(v)}::date`;
const W = { w1: "'00000000-0000-0000-0000-0000000000a1'", w2: "'00000000-0000-0000-0000-0000000000a2'" };
const u = v => (v ? `${W[v]}::uuid` : 'null::uuid');
const rows = [];
const add = (group, c, expr) => rows.push({ name: `${group}: ${c.name}`, expr, expect: c.expect });
for (const c of C.nights) add('nights', c, `rb_nights(${d(c.arrival)}, ${d(c.departure)})::text`);
for (const c of C.overlaps) add('overlaps', c, `rb_overlaps(${d(c.a1)}, ${d(c.a2)}, ${d(c.b1)}, ${d(c.b2)})::text`);
for (const c of C.boundary)
  add(
    'boundary',
    c,
    `rb_boundary(${u(c.dep.workerId)}, ${d(c.dep.departure)}, ${q(c.dep.depStatus)}, ${u(c.next?.workerId)}, ${d(c.next?.arrival)})`,
  );
for (const c of C.cleanWindow)
  add('cleanWindow', c, `rb_clean_window(${d(c.afterDate)}, ${d(c.readyBy)}, ${d(c.date)})`);
for (const c of C.statusGate)
  add('statusGate', c, `rb_status_gate(${q(c.target)}, ${c.vacated}, ${d(c.today)}, ${d(c.afterDate)})`);
for (const c of C.stay)
  add(
    'stay',
    c,
    `rb_stay_error(${d(c.stay.arrival || null)}, ${d(c.stay.departure)}, ${q(c.stay.depStatus)}, ${d(c.stay.away?.from)}, ${d(c.stay.away?.to)}, ${q(JSON.stringify(c.others))}::jsonb)`,
  );
const sql = rows.map((r, i) => `select ${i} || '|' || coalesce((${r.expr}), 'null');`).join('\n');
const out = execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql }).toString().trim().split('\n');
let pass = 0,
  fail = 0;
for (const line of out) {
  const [i, got] = line.split('|');
  const r = rows[+i];
  const exp = r.expect === null ? 'null' : String(r.expect);
  const ok = got === exp;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.name}${ok ? '' : ` (got ${got}, want ${exp})`}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || out.length !== rows.length ? 1 : 0);
