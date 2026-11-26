import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const MATERIAL_SHEET = 'MedSupplies&Others';
const CORE = {
  item_id: 0, category: 1, mph_code: 2, mph_short: 3, mph_long: 4,
  unspsc_commodity: 13, unspsc_title: 14, hospital_key: 18, hospital_name: 19,
  hospital_code: 20, hospital_desc: 21, supplier: 22, mph_item_code: 50,
  change_category: 51, new_short: 52, new_long: 53,
  priority: 91, status: 92, review_date: 93, remarks: 94,
};
export function text(value) {
  if (value == null) return null;
  return String(value).trim() || null;
}
export function validateMaterialHeaders(headers) {
  const expected = {0:'ID',1:'CATEGORY',2:'MPH CODE',3:'MPH SHORT DESCRIPTION',4:'MPH LONG DESCRIPTION',13:'COMMODITY',14:'COMMODITY TITLE',18:'HOSPITAL KEY',19:'HOSPITAL NAME',20:'HOSPITAL CODE',21:'HOSPITAL ITEM DESCRIPTION',22:'SUPPLIER',50:'MPH ITEM CODE (DO NOT FILL UP)',51:'CATEGORY',52:'MPH SHORT DESCRIPTION',53:'MPH LONG DESCRIPTION',91:'PRIORITY',92:'STATUS',93:'LAST UPDATED',94:'REMARKS'};
  for (const [index, label] of Object.entries(expected)) {
    if ((text(headers[index]) ?? '').toUpperCase() !== label) throw new Error(`Invalid material master layout: column ${Number(index) + 1} must be ${label}`);
  }
}
export function mapMaterialRow(values, headers) {
  const id = text(values[0]);
  if (!id) return null;
  const record = Object.fromEntries(Object.entries(CORE).map(([key, index]) => [key, text(values[index])]));
  // Numeric source IDs also occur in Medicines and are not portal Request IDs.
  record.item_id = `VMM-MS:${id}`;
  const date = Number(record.review_date);
  if (record.review_date && date > 20000 && date < 80000) record.review_date = new Date(Math.round((date - 25569) * 864e5)).toISOString().slice(0, 10);
  const pick = (start, end) => {
    const result = {};
    const seen = new Map();
    for (let i = start; i <= end; i++) {
      const name = text(headers[i]) ?? `COLUMN ${i + 1}`;
      const occurrence = (seen.get(name) ?? 0) + 1;
      seen.set(name, occurrence);
      const value = text(values[i]);
      if (value !== null) result[occurrence === 1 ? name : `${name} (${occurrence})`] = value;
    }
    return result;
  };
  record.mph_data = { ...pick(5, 17), ...pick(23, 48), _source_workbook: 'Vertical Material Master', _source_sheet: MATERIAL_SHEET, _source_id: id };
  record.pasia_data = pick(54, 90);
  return record;
}

export async function readMaterialMaster(path) {
  const localPython = resolve('.venv-import', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.IMPORT_PYTHON || (existsSync(localPython) ? localPython : 'python');
  const child = spawn(python, ['-u', fileURLToPath(new URL('./read-material-master.py', import.meta.url)), path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`XLSB reader failed: ${stderr}. Install scripts/requirements-import.txt and set IMPORT_PYTHON if needed.`)));
  });
  // Handle early process errors while consuming stdout.
  completed.catch(() => {});
  let headers;
  const byId = new Map();
  let dupes = 0, empty = 0, count = 0;
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      const row = JSON.parse(line);
      if (row.number === 2) { headers = row.values; validateMaterialHeaders(headers); continue; }
      if (!headers) throw new Error('Missing material master headers on row 2');
      const record = mapMaterialRow(row.values, headers);
      if (!record) { empty++; continue; }
      if (byId.has(record.item_id)) dupes++;
      byId.set(record.item_id, record);
      if (++count % 10000 === 0) console.log(`Read ${count} material rows...`);
    }
    await completed;
  } catch (error) { child.kill(); throw error; }
  if (!headers || !byId.size) throw new Error('No material master records found');
  return { rows: [...byId.values()], dupes, empty };
}
