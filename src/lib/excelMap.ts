/**
 * Maps one row of an MPH Excel (headers on row 2) to a public.items record.
 * Two layouts: the "working" Excel (88 columns) and the vertical "master data" (95 columns, sheet MedSupplies&Others).
 */

// 0-based column positions in the sheet
const CORE = {
  item_id: 0, category: 1, mph_code: 2, hospital_key: 3, hospital_name: 4, hospital_code: 5,
  hospital_desc: 6, supplier: 7, mph_short: 8, mph_long: 9, unspsc_commodity: 18, unspsc_title: 19,
  mph_item_code: 49, change_category: 50, new_short: 51, new_long: 52, priority: 84, status: 85,
  review_date: 86, remarks: 87,
} as const;

// Master data layout (MASTERDATA-VERTICAL.xlsx, sheet MedSupplies&Others)
const MASTER_CORE: Record<keyof typeof CORE, number> = {
  item_id: 0, category: 1, mph_code: 2, hospital_key: 18, hospital_name: 19, hospital_code: 20,
  hospital_desc: 21, supplier: 22, mph_short: 3, mph_long: 4, unspsc_commodity: 13, unspsc_title: 14,
  mph_item_code: 50, change_category: 51, new_short: 52, new_long: 53, priority: 91, status: 92,
  review_date: 93, remarks: 94,
};
export type Layout = 'working' | 'master';
export const MAX_COLS = 95;

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const MPH_ATTRS = [10, 11, 12, 13, 14, 15, 16, 17, ...range(20, 48)];
const PASIA_ATTRS = range(53, 83);

export type ImportRow = { [K in keyof typeof CORE]: string | null } & {
  mph_data: Record<string, string>;
  pasia_data: Record<string, string>;
};

export type WorkerMsg =
  | { type: 'progress'; n: number }
  | { type: 'layout'; layout: Layout }
  | { type: 'rows'; rows: ImportRow[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

const EXPECTED: [number, string][] = [
  [1, 'CATEGORY'], [2, 'MPH CODE'], [6, 'HOSPITAL ITEM DESCRIPTION'], [8, 'MPH SHORT DESCRIPTION'], [84, 'PRIORITY'], [85, 'STATUS'],
];
const EXPECTED_MASTER: [number, string][] = [
  [1, 'CATEGORY'], [2, 'MPH CODE'], [3, 'MPH SHORT DESCRIPTION'], [13, 'COMMODITY'], [21, 'HOSPITAL ITEM DESCRIPTION'], [92, 'STATUS'], [94, 'REMARKS'],
];
const mismatch = (h: string[], exp: [number, string][]): [number, string] | undefined =>
  exp.find(([i, name]) => (h[i] ?? '').trim().toUpperCase() !== name);

/** Which layout is this header row? Returns an error message if it is neither. */
export function detectLayout(h: string[]): { layout: Layout } | { error: string } {
  if (!mismatch(h, EXPECTED)) return { layout: 'working' };
  if (!mismatch(h, EXPECTED_MASTER)) return { layout: 'master' };
  const bad = mismatch(h, EXPECTED)!;
  return { error: `Column ${bad[0] + 1} should be “${bad[1]}” but is “${h[bad[0]] ?? ''}”. This is neither the MPH working Excel nor the vertical master data layout.` };
}

/** Excel stores dates as serial numbers; turn 46000 into 2026-xx-xx. */
function dateText(s: string | null): string | null {
  if (s && /^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
  }
  return s;
}

export function mapRow(cells: (string | null | undefined)[], headers: string[], layout: Layout = 'working'): ImportRow | null {
  const id = cells[0];
  if (!id) return null;
  const master = layout === 'master';
  const rec: Record<string, unknown> = {};
  for (const [k, i] of Object.entries(master ? MASTER_CORE : CORE)) rec[k] = cells[i] ?? null;
  // Numeric source IDs also occur in the Medicines sheet and are not portal Request IDs.
  if (master) rec.item_id = `VMM-MS:${id}`;
  rec.review_date = dateText(rec.review_date as string | null);
  const pick = (cols: number[]): Record<string, string> => {
    const o: Record<string, string> = {};
    const seen = new Map<string, number>();
    for (const i of cols) {
      const name = headers[i] || `COLUMN ${i + 1}`;
      const nth = (seen.get(name) ?? 0) + 1;
      seen.set(name, nth);
      const v = cells[i];
      if (v) o[nth === 1 ? name : `${name} (${nth})`] = v;
    }
    return o;
  };
  if (master) {
    rec.mph_data = { ...pick(range(5, 17)), ...pick(range(23, 48)), _source_workbook: 'Vertical Material Master', _source_sheet: 'MedSupplies&Others', _source_id: id };
    rec.pasia_data = pick(range(54, 90));
  } else {
    rec.mph_data = pick(MPH_ATTRS);
    rec.pasia_data = pick(PASIA_ATTRS);
  }
  return rec as ImportRow;
}
