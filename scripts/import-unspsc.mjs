// Loads the official UNSPSC list (UNDP unspsc_english.xlsx) into public.unspsc. Safe to re-run: rows are upserted by code.
// Run supabase/unspsc.sql first, then:
//   node --env-file=.env scripts/import-unspsc.mjs "C:\path\to\unspsc_english.xlsx"
// Segment 85 (Healthcare Services: 76k surgical/imaging procedures, ~60% of the file) is skipped by default to save
// database space; they are services, not items. Add --all to load it too.
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SKIP = process.argv.includes('--all') ? [] : ['85'];
if (!file) { console.error('Give the path to unspsc_english.xlsx'); process.exit(1); }
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const HEAD = ['Version', 'Key', 'Segment', 'Segment Title', 'Segment Definition', 'Family', 'Family Title', 'Family Definition',
  'Class', 'Class Title', 'Class Definition', 'Commodity', 'Commodity Title', 'Commodity Definition', 'Synonym', 'Acronym'];
const BATCH = 1000;

const val = (x) => (x && typeof x === 'object' ? (x.text ?? x.result ?? '') : x);
const txt = (x) => { const s = String(val(x) ?? '').trim(); return s || null; };
const code = (x) => { const s = txt(x); return s && /^\d{8}$/.test(s) ? s : null; };

function toRecord(v) {
  const seg = code(v[2]), fam = code(v[5]), cls = code(v[8]), com = code(v[11]);
  const [level, c, title, definition] = com ? ['commodity', com, v[12], v[13]]
    : cls ? ['class', cls, v[9], v[10]]
    : fam ? ['family', fam, v[6], v[7]]
    : seg ? ['segment', seg, v[3], v[4]] : [];
  if (!level || !txt(title)) return null;
  return {
    code: c, level, title: txt(title), definition: txt(definition),
    segment: seg, segment_title: txt(v[3]), family: fam, family_title: txt(v[6]), class: cls, class_title: txt(v[9]),
    synonym: txt(v[14]), acronym: txt(v[15]), version: txt(v[0]),
  };
}

async function send(rows) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await db.from('unspsc').upsert(rows, { onConflict: 'code' });
    if (!error) return;
    if (attempt >= 5) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', worksheets: 'emit' });
let headerFound = false, read = 0, sent = 0, skipped = 0, left = 0;
const byCode = new Map();
for await (const ws of reader) {
  for await (const row of ws) {
    const v = row.values.slice(1);
    if (!headerFound) {
      headerFound = HEAD.every((h, i) => txt(v[i]) === h);
      continue;
    }
    read++;
    const rec = toRecord(v);
    if (!rec) skipped++;
    else if (SKIP.some((s) => rec.code.startsWith(s))) left++;
    else byCode.set(rec.code, rec);
  }
  break; // first sheet only
}
if (!headerFound) { console.error(`Header row not found. Expected: ${HEAD.join(', ')}`); process.exit(1); }

const all = [...byCode.values()];
console.log(`Read ${read} rows: ${all.length} codes to load, ${left} left out (segment ${SKIP.join(', ') || 'none'}), ${skipped} blank rows. Uploading…`);
for (let i = 0; i < all.length; i += BATCH) {
  await send(all.slice(i, i + BATCH));
  sent = Math.min(i + BATCH, all.length);
  if (sent % 10000 < BATCH || sent === all.length) console.log(`  ${sent} / ${all.length}`);
}
const counts = Object.entries(all.reduce((m, r) => ({ ...m, [r.level]: (m[r.level] ?? 0) + 1 }), {}));
console.log(`Done. ${counts.map(([k, n]) => `${n} ${k}`).join(', ')}.`);
