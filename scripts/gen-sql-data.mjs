/* global Buffer, console */
// Prints the property/unit/room data section of supabase/migrations/0008 from src/data/properties.ts, so the
// live database gets exactly the details the demo shows. node scripts/gen-sql-data.mjs > /tmp/data.sql
import { buildSync } from 'esbuild';
const out = buildSync({ entryPoints: ['src/data/properties.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { PROPERTIES, UNITS, ROOMS } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const q = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = a => (a ? `array[${a.map(q).join(',')}]::text[]` : `'{}'::text[]`);
const js = o => `${q(JSON.stringify(o))}::jsonb`;
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const lines = [];
PROPERTIES.forEach((p, i) => {
  const d = pick(p, ['area', 'photos', 'sleeps', 'mapUrl', 'website', 'credit', 'todo']);
  lines.push(
    `insert into properties (id,name,short_name,contracted,address,blurb,photo_url,features,beds_label,brand,checkout_time,checkin_time,sort,details) values (${[
      q(p.id), q(p.name), q(p.short), p.contracted, q(p.address), q(p.blurb), q(p.photo), arr(p.features), q(p.beds), q(p.brand),
      q(p.checkout ?? '10:00'), q(p.checkin ?? '15:00'), i + 1, js(d),
    ].join(',')})\n  on conflict (id) do update set name=excluded.name, short_name=excluded.short_name, address=excluded.address, blurb=excluded.blurb, photo_url=excluded.photo_url, features=excluded.features, beds_label=excluded.beds_label, brand=excluded.brand, details=excluded.details;`,
  );
});
UNITS.forEach((u, i) =>
  lines.push(`insert into units (id,property_id,name,sort) values (${q(u.id)},${q(u.propertyId)},${q(u.name)},${i + 1}) on conflict (id) do update set name=excluded.name;`),
);
ROOMS.forEach((r, i) => {
  const d = pick(r, ['photos', 'desc', 'beds']);
  lines.push(
    `insert into rooms (id,property_id,unit_id,name,floor,bath,note,photo_url,sort,details) values (${[q(r.id), q(r.propertyId), q(r.unitId), q(r.name), q(r.floor), q(r.bath), q(r.note), q(r.photo), i + 1, js(d)].join(',')})\n  on conflict (id) do update set name=excluded.name, bath=excluded.bath, note=excluded.note, photo_url=excluded.photo_url, details=excluded.details;`,
  );
});
console.log(lines.join('\n'));
