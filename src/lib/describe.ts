import { SHORT_LIMIT } from '../data/guides';
import { S } from '../state';
import type { Descriptions } from '../types';
import { norm } from './match';

const val = (v: Record<string, string>, col: string): string => (v[col] ?? '').trim().toUpperCase();
const join = (v: Record<string, string>, cols: string[]): string[] => cols.map((c) => val(v, c)).filter(Boolean);

/**
 * Suggest descriptions from the attributes, joined with ";" like the working Excel.
 * It is only a starting point: the analyst can edit both descriptions.
 */
export function buildDescriptions(v: Record<string, string>): Descriptions {
  const long = join(v, [
    'NOUN', 'TYPE', 'ITEM_TYPE', 'MATERIAL/COMPOSITION (1)', 'MATERIAL/COMPOSITION (2)',
    'DIMENSION/SIZE (1)', 'DIMENSION/SIZE (2)', 'DIMENSION/SIZE (3)', 'LENGTH (1)', 'LENGTH (2)', 'LENGTH (3)', 'LENGTH (4)',
    'SHAPE', 'COLOR', 'DIAMETER', 'ANGLE', 'CONFIGURATION', 'ITEM BRAND/MODEL', 'EQUIPMENT BRAND/ MODEL', 'MANUFACTURER', 'MANUFACTURE ITEM CODE',
  ]);
  const short = join(v, ['NOUN', 'TYPE', 'DIMENSION/SIZE (1)', 'LENGTH (1)', 'CONFIGURATION', 'ITEM BRAND/MODEL']);
  // too long for the short description: drop details from the end, keeping Noun;Type
  while (short.length > 2 && short.join(';').length > SHORT_LIMIT) short.pop();
  return { short: short.join(';'), long: long.join(';') };
}

/** Keep the two descriptions in step with the attributes, unless the analyst has edited them. */
export function syncDesc(): void {
  const auto = buildDescriptions(S.vals);
  if (!S.desc.eShort) S.desc.short = auto.short;
  if (!S.desc.eLong) S.desc.long = auto.long;
}

const BRANDS = ['VENFLON', 'INTROCAN', 'SURFLO'];
const MAKERS = ['TERUMO', 'NIPRO', 'B. BRAUN', 'VYGON', 'BD'];

/** Pre-fill what can be read straight from the hospital text, for the analyst to confirm. */
export function prefillFromText(text: string): Record<string, string> {
  const n = norm(text);
  const v: Record<string, string> = {};
  const size = n.match(/\b\d{2}G\b/)?.[0];
  if (size) v['DIMENSION/SIZE (1)'] = size;
  const len = n.match(/\b\d+(?:\.\d+)?(?:MM|CM)\b/)?.[0];
  if (len) v['LENGTH (1)'] = len;
  if (/\bNON STERILE\b/.test(n)) v['STERILE/NON STERILE'] = 'NON STERILE';
  else if (/\bSTERILE\b/.test(n)) v['STERILE/NON STERILE'] = 'STERILE';
  if (/\bLATEX FREE\b/.test(n)) v['LATEX FREE/LATEX'] = 'LATEX FREE';
  if (/\bDISPOSABLE\b/.test(n)) v['DISPOSABLE/REUSABLE'] = 'DISPOSABLE';
  else if (/\bREUSABLE\b/.test(n)) v['DISPOSABLE/REUSABLE'] = 'REUSABLE';
  const brand = BRANDS.find((b) => n.includes(b));
  if (brand) v['ITEM BRAND/MODEL'] = brand;
  const maker = MAKERS.find((m) => ` ${n} `.includes(` ${m} `));
  if (maker) v.MANUFACTURER = maker;
  return v;
}
