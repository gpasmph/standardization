// Usage: node --env-file=.env scripts/import-items.mjs [--dry]
// Reads the working Excel (sheet "1ST PRIORITY", headers on row 2) and upserts into public.items.
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readMaterialMaster } from './material-master.mjs';

const DRY = process.argv.includes('--dry');
const UPDATE = process.argv.includes('--update');
const RESUME = process.argv.includes('--resume');
const MATERIAL = process.argv.includes('--material-master');
const BATCH = 500;
const checkpointDir = resolve('.import-checkpoints');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const fileArg = process.argv.indexOf('--file');
if (fileArg >= 0 && (!process.argv[fileArg + 1] || process.argv[fileArg + 1].startsWith('--'))) throw new Error('--file requires a path');
const EXCEL_PATH = fileArg >= 0 ? process.argv[fileArg + 1] : process.env.EXCEL_PATH;
if (!EXCEL_PATH || (!DRY && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY))) {
  console.error('Missing .env values'); process.exit(1);
}

// Column positions (0-based) in the sheet
const CORE = {
  item_id: 0, category: 1, mph_code: 2, hospital_key: 3, hospital_name: 4, hospital_code: 5,
  hospital_desc: 6, supplier: 7, mph_short: 8, mph_long: 9, unspsc_commodity: 18, unspsc_title: 19,
  mph_item_code: 49, change_category: 50, new_short: 51, new_long: 52, priority: 84, status: 85,
  review_date: 86, remarks: 87,
};
const MPH_ATTRS = [10, 11, 12, 13, 14, 15, 16, 17, ...range(20, 48)];   // everything else in MPH TEAM
const PASIA_ATTRS = range(53, 83);                                      // everything else in PASIA TEAM
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

function cell(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cell(v.result);          // formula
    if ('richText' in v) return cell(v.richText.map((t) => t.text).join(''));
    if ('text' in v) return cell(v.text);              // hyperlink
    if ('error' in v) return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

let rows, dupes = 0, empty = 0;
if (MATERIAL) {
  ({ rows, dupes, empty } = await readMaterialMaster(EXCEL_PATH));
} else {
if (/\.xlsb$/i.test(EXCEL_PATH)) throw new Error('For this XLSB workbook use npm run import:material:check or npm run import:material');
const wb = new ExcelJS.stream.xlsx.WorkbookReader(EXCEL_PATH, { sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'cache', worksheets: 'emit' });
const byId = new Map();
let headers = null, rowNo = 0;

for await (const ws of wb) {
  if (ws.id !== 1 && ws.name !== '1ST PRIORITY') continue;
  for await (const row of ws) {
    rowNo = row.number;
    const v = row.values.slice(1);                      // → 0-based
    if (rowNo === 2) {
      headers = v.map((h) => (cell(h) ?? '').trim());
      for (const [i, expected] of [[1, 'CATEGORY'], [2, 'MPH CODE'], [6, 'HOSPITAL ITEM DESCRIPTION'], [8, 'MPH SHORT DESCRIPTION'], [84, 'PRIORITY'], [85, 'STATUS']]) {
        if ((headers[i] ?? '').toUpperCase() !== expected) throw new Error(`Invalid Excel layout: column ${i + 1} must be ${expected}`);
      }
      continue;
    }
    if (rowNo < 3) continue;
    if (!headers) throw new Error('Missing headers on row 2');
    const id = cell(v[0]);
    if (!id) { empty++; continue; }
    const rec = {};
    for (const [k, i] of Object.entries(CORE)) rec[k] = cell(v[i]);
    if (/^\d{5}(\.\d+)?$/.test(rec.review_date ?? '')) {
      const serial = Number(rec.review_date);
      if (serial > 20000 && serial < 80000) rec.review_date = new Date(Math.round((serial - 25569) * 864e5)).toISOString().slice(0, 10);
    }
    const pick = (cols) => Object.fromEntries(cols.map((i) => [headers[i], cell(v[i])]).filter(([, x]) => x !== null));
    rec.mph_data = pick(MPH_ATTRS);
    rec.pasia_data = pick(PASIA_ATTRS);
    if (byId.has(id)) dupes++;
    byId.set(id, rec);                                  // last one wins
  }
  break;
}

rows = [...byId.values()];
if (!headers || !rows.length) throw new Error('No valid data rows found in the first worksheet');
}
console.log(`Parsed ${rows.length} items (${dupes} duplicate IDs merged, ${empty} blank rows skipped)`);
if (DRY) { console.log(`Validated. ${Math.ceil(rows.length / BATCH)} batches of up to ${BATCH} rows. No database writes.`); process.exit(0); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hash = createHash('sha256');
for await (const chunk of createReadStream(EXCEL_PATH)) hash.update(chunk);
hash.update(JSON.stringify({ target: SUPABASE_URL, update: UPDATE, batch: BATCH, mapping: MATERIAL ? 'material-master-v1' : 2 }));
const checkpoint = resolve(checkpointDir, `${hash.digest('hex')}.json`);
await mkdir(checkpointDir, { recursive: true });
let start = 0;
if (RESUME) {
  try {
    const saved = JSON.parse(await readFile(checkpoint, 'utf8'));
    if (!Number.isInteger(saved.done) || saved.done < 0 || saved.done > rows.length) throw new Error('Invalid import checkpoint');
    start = saved.done;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log(`${UPDATE ? 'Overwrite existing IDs' : 'Skip existing IDs'}; starting at ${start} / ${rows.length}`);
for (let i = start; i < rows.length; i += BATCH) {
  for (let attempt = 0; ; attempt++) {
    let result;
    try {
      result = await supabase.from('items').upsert(rows.slice(i, i + BATCH), { onConflict: 'item_id', ignoreDuplicates: !UPDATE }).abortSignal(AbortSignal.timeout(60000));
    } catch (error) {
      result = { error, status: 0 };
    }
    const { error, status } = result;
    if (!error) break;
    const transient = status === 0 || status === 408 || status === 429 || status >= 500;
    if (!transient || attempt >= 5) throw new Error(`Stopped at rows ${i + 1}-${Math.min(i + BATCH, rows.length)}: ${error.message}. Rerun with --resume.`);
    const delay = Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`Retry ${attempt + 1}/5 in ${delay / 1000}s: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  await writeFile(`${checkpoint}.tmp`, JSON.stringify({ done: Math.min(i + BATCH, rows.length) }));
  await rename(`${checkpoint}.tmp`, checkpoint);
  process.stdout.write(`\rImported ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}
console.log('\nDone.');
