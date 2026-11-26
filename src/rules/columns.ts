/**
 * The columns the lookup fills, in the order of the working Excel. `key` is what the portal stores (it matches the PASIA
 * columns of the Excel); `label` is the name the team knows from the MPH columns. Nothing else is asked for.
 */
export interface Col { key: string; label: string }

export const ATTR_COLS: Col[] = [
  { key: 'NOUN', label: 'NOUN' },
  { key: 'TYPE', label: 'TYPE' },
  { key: 'MANUFACTURER', label: 'MANUFACTURER' },
  { key: 'MANUFACTURE ITEM CODE', label: 'MANUFACTURE ITEM CODE' },
  { key: 'ITEM BRAND/MODEL', label: 'BRAND/MODEL' },
  { key: 'MATERIAL/COMPOSITION (1)', label: 'MATERIAL/COMPOSITION' },
  { key: 'DIMENSION/SIZE (1)', label: 'DIMENSION/SIZE (LXBXH)' },
  { key: 'DIMENSION/SIZE (2)', label: 'DIMENSION/SIZE_ADDITIONAL (LXBXH)' },
  { key: 'LENGTH (1)', label: 'LENGTH' },
  { key: 'LENGTH (2)', label: 'LENGTH_ADDITIONAL' },
  { key: 'SHAPE', label: 'SHAPE' },
  { key: 'COLOR', label: 'COLOR' },
  { key: 'DIAMETER', label: 'DIAMETER' },
  { key: 'ANGLE', label: 'ANGLE' },
  { key: 'CONFIGURATION', label: 'CONFIGURATION' },
  { key: 'NO. OF ITEMS', label: 'NO. OF ITEMS' },
  { key: 'ITEM_TYPE', label: 'ITEM_TYPE' },
  { key: 'LATEX FREE/LATEX', label: 'LATEX FREE/LATEX' },
  { key: 'DISPOSABLE/REUSABLE', label: 'DISPOSABLE/REUSABLE' },
  { key: 'STERILE/NON STERILE', label: 'STERILE/NON STERILE' },
  { key: 'OTHER ATTRIBUTES (1)', label: 'OTHER ATTRIBUTE' },
];

/** Filled from the proofs, never typed: where the item code and the other attributes came from. */
export const SRC = {
  codeData: 'SOURCE DATA FOR MANUFACTURE ITEM CODE',
  codeLink: 'FILE NAME/FILE LINK/WEB LINK FOR MANUFACTURE ITEM CODE',
  otherData: 'SOURCE DATA FOR OTHER ATTRIBUTES',
  otherLink: 'FILE NAME/FILE LINK/WEB LINK FOR OTHER ATTRIBUTES',
  otherLink2: 'FILE NAME/FILE LINK/WEB LINK FOR OTHER ATTRIBUTES (2)',
} as const;

/** The header text the working Excel uses for the source columns (it spells "ATTIBUTES"), so what is saved matches the sheet. */
export const EXCEL_SRC: Record<string, string> = {
  [SRC.codeData]: 'SOURCE DATA FOR MANUFACTURE ITEM CODE',
  [SRC.codeLink]: 'FILE NAME/FILE LINK/WEB LINK FOR MANUFACTURE ITEM CODE',
  [SRC.otherData]: 'SOURCE DATA FOR OTHER ATTIBUTES',
  [SRC.otherLink]: 'FILE NAME/FILE LINK/WEB LINK FOR OTHER ATTIBUTES',
};

export const SOURCE_COLS: Col[] = Object.values(SRC).map((key) => ({ key, label: key }));

/** Every column the lookup is responsible for, without NOUN (the category decides that). */
export const ASK_KEYS: string[] = ATTR_COLS.filter((c) => c.key !== 'NOUN').map((c) => c.key);

export const labelOf = (key: string): string => [...ATTR_COLS, ...SOURCE_COLS].find((c) => c.key === key)?.label ?? key;

interface ProofLike { value: string; url: string; site: string }
const isWeb = (u: string): boolean => /^https?:\/\//i.test(u);

/** The SOURCE DATA / FILE-LINK columns, using the words the team already uses (WEB INFORMATION, HOSPITAL DESCRIPTION). */
export function sourceColumns(raw: Record<string, string>, proofs: Record<string, ProofLike>): Record<string, string> {
  const own = (k: string): ProofLike | undefined => {
    const p = proofs[k];
    return p && (raw[k] ?? '').trim().toUpperCase() === p.value.trim().toUpperCase() ? p : undefined;
  };
  const out: Record<string, string> = {};
  const code = own('MANUFACTURE ITEM CODE');
  if (code) {
    if (isWeb(code.url)) { out[SRC.codeData] = 'WEB INFORMATION'; out[SRC.codeLink] = code.url; }
    else if (code.site === 'Hospital description') out[SRC.codeData] = 'HOSPITAL DESCRIPTION';
  }
  const others = ATTR_COLS.map((c) => c.key).filter((k) => k !== 'NOUN' && k !== 'MANUFACTURE ITEM CODE').map(own).filter((p): p is ProofLike => !!p);
  const urls = [...new Set(others.filter((p) => isWeb(p.url)).map((p) => p.url))];
  if (urls.length) { out[SRC.otherData] = 'WEB INFORMATION'; out[SRC.otherLink] = urls[0] ?? ''; if (urls[1]) out[SRC.otherLink2] = urls[1]; }
  else if (others.some((p) => p.site === 'Hospital description')) out[SRC.otherData] = 'HOSPITAL DESCRIPTION';
  return out;
}
