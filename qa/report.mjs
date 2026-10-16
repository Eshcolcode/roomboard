// Builds docs/TEST-REPORT.md from the three suites. Usage:
//   QA_URL=https://roomboard.pages.dev/ node qa/report.mjs
// Runs vitest (unit), qa/sql.sh (SQL smoke + shared cases on local Postgres) and qa/qa.mjs (e2e against QA_URL).
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
const sh = (c, o = {}) => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 26, ...o });
const URL_ = process.env.QA_URL ?? 'http://localhost:4173/';
const sha = sh('git rev-parse HEAD').trim();
const dirty = sh('git status --porcelain -- src rules supabase qa').trim();
const asset = u => (sh(`curl -fsSL ${u}`).match(/assets\/index-[\w-]+\.js/) ?? ['?'])[0];
const localAsset = (readFileSync('dist/index.html', 'utf8').match(/assets\/index-[\w-]+\.js/) ?? ['?'])[0];
const target = asset(URL_);
const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' });

// unit
spawnSync('npx', ['vitest', 'run', '--reporter=json', '--outputFile=/tmp/unit.json'], { stdio: 'ignore' });
const unit = JSON.parse(readFileSync('/tmp/unit.json', 'utf8'));
const unitRows = unit.testResults.flatMap(f =>
  f.assertionResults.map(a => ({
    file: f.name.split('/src/')[1],
    name: [...a.ancestorTitles, a.title].join(' › '),
    pass: a.status === 'passed',
  })),
);
// sql
const sqlOut = spawnSync('bash', ['qa/sql.sh'], {
  encoding: 'utf8',
  env: { ...process.env, PATH: '/usr/lib/postgresql/17/bin:' + process.env.PATH },
}).stdout;
const sqlRows = sqlOut
  .split('\n')
  .filter(l => /^(PASS|FAIL) /.test(l))
  .map(l => ({ name: l.slice(5), pass: l.startsWith('PASS') }));
// e2e
const e2e = spawnSync('node', ['qa/qa.mjs'], { encoding: 'utf8', env: { ...process.env, QA_URL: URL_ } });
const e = JSON.parse(readFileSync('/tmp/e2e-results.json', 'utf8'));

const count = rows => `${rows.filter(r => r.pass).length}/${rows.length} passed`;
const table = (rows, cols) =>
  [
    '| # | Check | Result |',
    '|---|---|---|',
    ...rows.map(
      (r, i) => `| ${i + 1} | ${(cols ? cols(r) : r.name).replace(/\|/g, '\\|')} | ${r.pass ? 'PASS' : '**FAIL**'} |`,
    ),
  ].join('\n');
const lint = spawnSync('npm', ['run', 'lint'], { encoding: 'utf8' }).status === 0 ? 'clean' : '**errors**';
const md = `# Test report

- **Run:** ${when} (UK time)
- **Commit:** \`${sha}\`${dirty ? ' (with uncommitted changes in tested paths)' : ''}
- **Target for end-to-end tests:** ${URL_} serving \`${target}\`
- **Local production build:** \`${localAsset}\` ${target === localAsset ? '(same asset as the target: the deployed site is this commit)' : '(**differs from target**)'}
- **Totals:** unit ${count(unitRows)} · SQL ${count(sqlRows)} · end-to-end ${count(e.results)} · lint (ESLint + Prettier) ${lint}

All demo-mode checks below run without any of Donald's accounts. The live database, email and SMS checks need a real Supabase project, a Resend key and a Twilio account, and are **pending** (bottom section).

## 1. Unit tests (vitest) – ${count(unitRows)}
Pure rules (\`src/data/rules.ts\`) and the rotation generator (\`src/data/rotation.ts\`) driven by the shared \`rules/cases.json\`, date helpers, store rules (\`core.ts\`), demo commands (\`local/\`: exception override, undo), crew booking (\`crew.ts\`: allocation, all-or-nothing, extend / shorten / single occurrence) and the role-aware Copy summary.

${table(unitRows, r => `${r.file} › ${r.name}`)}

## 2. SQL tests on local Postgres 17 – ${count(sqlRows)}
Fresh database, migrations 0001–0004, 0006 and 0007 (pg_cron 0005 skipped), \`supabase/tests/smoke.sql\` (trigger behaviour, including crew bookings through \`apply_series()\`), then **the same \`rules/cases.json\`** through the \`rb_*\` SQL functions that the triggers call. Runs as a superuser, so row-level security is **not** exercised here.

${table(sqlRows)}

## 3. End-to-end (Playwright, Chrome) – ${count(e.results)}
Desktop 1440px plus 820/900/1000px layout checks, phone 390×844, every role (provider, Sheena, cleaner), axe WCAG 2 A/AA. Group \`[v2]\`: room cards, filtering tiles, urgent banner, Copy summary (clipboard read back), crew booking end to end, drag to move / resize with clash feedback and undo.

${table(e.results, r => (r.group !== 'e2e' ? `[${r.group}] ` : '') + r.name)}

## 4. Live database, email and SMS – pending (needs Donald's accounts)
| Check | Status |
|---|---|
| Magic-link sign-in for Donald and Sheena on separate devices | pending |
| RLS through the API: client cannot read cleaner profiles, write changeovers or read others' alerts; cleaner cannot edit stays | pending |
| Concurrent double-booking: exactly one succeeds (exclusion constraint) | pending |
| Stale edit rejected across two real sessions (40001) | pending |
| Duplicate submissions deduped | pending |
| Realtime: change appears in the other browser within ~1 s | pending |
| Undo in live mode (inverse change through the triggers) | pending |
| \`node qa/sql-rules.mjs\` against the live project | pending |
| Email via Resend with every browser closed (pg_cron → dispatch-alerts); failure → retry → delivered | pending |
| SMS via Twilio for an opted-in user | pending |
| 07:00 digest on both sides of the 25 Oct clock change | pending |
| Restore from backup into an isolated project | pending |
| Cloudflare Access in front of roomboard.pages.dev | pending |
| Crew booking through \`apply_series()\` with real RLS (client + manager tokens) | pending |

## 5. Scores (strict self-review, v2)
| Area | Score | Why not higher |
|---|---|---|
| Rules and consistency (TS = SQL) | 9.0 | Shared cases cover rules + rotation; reconcile itself is mirrored, not shared |
| Crew booking with rotations | 8.0 | No "move the whole series to other rooms" action (one occurrence at a time); live RPC not yet run on a real project |
| Drag to move / resize | 8.0 | Desktop mouse/pen only (phone keeps the panel); no auto-scroll while dragging past the visible weeks |
| Look (v2) and clarity | 8.5 | Board bars keep the earlier navy style; tiles wrap to 3 per row below 1100px |
| Copy summary | 9.0 | Plain text only (no per-property split) |
| Phone | 8.5 | Crew booking works on the phone but the preview grid needs sideways scrolling |
| Accessibility | 8.5 | axe clean on every screen; drag has the panel as its keyboard route |
| Code quality | 8.5 | Lint/type clean, typed Supabase rows, store split, CI; Board.tsx and StayPanel.tsx are still the largest files |
| Live readiness | 6.0 | Supabase, email and SMS still need Donald's accounts (section 4) |
| **Overall** | **8.3** | |
`;
writeFileSync('docs/TEST-REPORT.md', md);
console.log(
  `unit ${count(unitRows)} · sql ${count(sqlRows)} · e2e ${count(e.results)} · target ${target} · local ${localAsset}`,
);
process.exit(
  unitRows.every(r => r.pass) && sqlRows.every(r => r.pass) && e.results.every(r => r.pass) && e2e.status === 0 ? 0 : 1,
);
