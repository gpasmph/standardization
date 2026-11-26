// Usage: node --env-file=.env scripts/upload-excel.mjs
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXCEL_PATH } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EXCEL_PATH) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or EXCEL_PATH in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = new Date().toISOString().slice(0, 10);
const path = `${stamp}/${basename(EXCEL_PATH).replace(/[^\w.\- ]/g, '_')}`;

const file = await readFile(EXCEL_PATH);
const { error } = await supabase.storage.from('excel-files').upload(path, file, {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  upsert: false, // never overwrite an earlier upload
});
if (error) { console.error('Upload failed:', error.message); process.exit(1); }
console.log(`Uploaded ${(file.length / 1048576).toFixed(1)} MB → excel-files/${path}`);
