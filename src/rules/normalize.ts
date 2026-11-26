import type { Change } from './types';

/** Values people type for "nothing here". They become empty instead of being written into a description. */
const EMPTY = new Set(['#N/A', 'N/A', 'NA', 'NONE', 'NIL', 'NULL', 'TBD', 'NOT SURE', 'UNKNOWN', '-', '--', '—']);

const UNITS = 'MM|CM|M|ML|L|G|MG|MCG|KG|IU|PSI|FR|CC|MIN|HZ|V|W|KPA|MMHG';

/** Columns that hold a count, where "0" is a real value. */
const NUMERIC = new Set(['NO. OF ITEMS']);

const SYNONYMS: Record<string, [RegExp, string][]> = {
  'LATEX FREE/LATEX': [[/^(LATEX[\s-]?FRE|LATEXFREE|NON[\s-]?LATEX)$/, 'LATEX FREE']],
  'DISPOSABLE/REUSABLE': [
    [/^(SINGLE[\s-]?USE|ONE[\s-]?TIME)$/, 'DISPOSABLE'],
    [/^(RE-?USABLE|MULTI[\s-]?USE)$/, 'REUSABLE'],
  ],
  'STERILE/NON STERILE': [[/^(NON[\s-]?STERILE|UNSTERILE|NOT STERILE)$/, 'NON STERILE']],
  UOM: [[/^(PC|PCS|PIECES|EA|EACH)$/, 'PIECE']],
};

/** One cleaned value for one column. Never invents data: it only fixes spelling and format. */
export function normalizeValue(col: string, raw: string): string {
  let v = raw.replace(/ /g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();
  if (EMPTY.has(v)) return '';
  if (v === '0' && !NUMERIC.has(col)) return '';

  // gauge: G23 / 23 GAUGE  ->  23G
  v = v.replace(/\bG(\d{2})\b/g, '$1G').replace(/\b(\d{2})\s*GAUGE\b/g, '$1G');
  // French size: FR 18 / FR.18  ->  FR18
  v = v.replace(/\bFR\.?\s?(\d)/g, 'FR$1');
  // inches: 16 INCH / 16 IN  ->  16"
  v = v.replace(/(\d(?:\.\d+)?)\s*(?:INCHES|INCH|IN)\b\.?/g, '$1"');
  // spelled-out units: 2 METERS -> 2M
  v = v.replace(/(\d)\s*(?:MILLIMETERS?|MILLIMETRES?)\b/g, '$1MM').replace(/(\d)\s*(?:CENTIMETERS?|CENTIMETRES?)\b/g, '$1CM').replace(/(\d)\s*(?:METERS?|METRES?)\b/g, '$1M');
  // "5 ML" -> "5ML"
  v = v.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, 'g'), '$1$2');

  // sizes: 3.75 x 30MM / 3.75*30MM  ->  3.75X30MM
  v = v.replace(/(\d(?:\.\d+)?[A-Z"]*)\s*[X×*]\s*(?=\d)/g, '$1X');

  for (const [re, to] of SYNONYMS[col] ?? []) if (re.test(v)) return to;
  return v;
}

export function normalizeAll(raw: Record<string, string>): { vals: Record<string, string>; changes: Change[] } {
  const vals: Record<string, string> = {};
  const changes: Change[] = [];
  for (const [col, r] of Object.entries(raw)) {
    const from = (r ?? '').trim();
    const to = normalizeValue(col, from);
    if (to) vals[col] = to;
    if (from && from !== to) changes.push({ col, from, to });
  }
  return { vals, changes };
}
