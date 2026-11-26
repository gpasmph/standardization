import type { CategoryConfig } from './types';
import { VOCAB } from './vocab.generated';

/** A value proposed from the hospital description alone, with where it came from (so the analyst can check it). */
export interface Proposed {
  value: string;
  /** Short label for the source, e.g. "Hospital description". */
  from: string;
  /** Plain-language reason. */
  note: string;
}

const NOUN = 'NOUN', TYPE = 'TYPE', ITYPE = 'ITEM_TYPE', DIM1 = 'DIMENSION/SIZE (1)', DIM2 = 'DIMENSION/SIZE (2)';

const words = (s: string): string[] => s.toUpperCase().match(/[A-Z0-9]+(?:[-/][A-Z0-9]+)*/g) ?? [];

/** Small typo tolerance: CANULA = CANNULA. Only for longer words, so short codes never match by accident. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const x = a.slice(i), y = b.slice(i);
  return x.slice(1) === y || x === y.slice(1) || x.slice(1) === y.slice(1);
}

/** The vocabulary value (from the team's Excel) that the description mentions; the longest, then most used, wins. */
function findTerm(col: string, cfg: CategoryConfig, toks: string[]): { value: string; n: number; said: string } | null {
  let best: { value: string; n: number; said: string; len: number } | null = null;
  for (const [value, n] of VOCAB[cfg.id]?.vocab[col] ?? []) {
    const vt = words(value);
    if (!vt.length) continue;
    const hit = vt.map((t) => toks.find((d) => near(d, t)));
    if (hit.some((h) => !h)) continue;
    if (!best || vt.length > best.len || (vt.length === best.len && n > best.n)) best = { value, n, said: hit.join(' '), len: vt.length };
  }
  return best;
}

/**
 * What can be said about the item from the hospital description alone, guided by the category's rules and by the values
 * the team already uses in the Excel. Nothing is invented: every value comes with the reason it was proposed.
 */
export function proposeFromDescription(cfg: CategoryConfig, description: string): Record<string, Proposed> {
  const out: Record<string, Proposed> = {};
  const toks = words(description);
  const text = ` ${description.toUpperCase()} `;
  const set = (col: string, value: string, from: string, note: string): void => {
    if (!out[col] && (col === NOUN || cfg.ask.includes(col))) out[col] = { value, from, note };
  };

  if (cfg.noun) set(NOUN, cfg.noun, 'Category guide', `The ${cfg.label} guide always uses the noun ${cfg.noun}.`);

  for (const col of [TYPE, ITYPE, 'CONFIGURATION', 'COLOR', 'SHAPE']) {
    const t = findTerm(col, cfg, toks);
    if (t) set(col, t.value, 'Hospital description', `"${t.said}" is in the description; the team writes ${t.value} in ${col} (${t.n} rows in the Excel).`);
  }
  // age group word (ADULT, INFANT...) goes in size
  const age = findTerm(DIM1, cfg, toks);

  const gauge = text.match(/\b(\d{2})\s?G(?:AUGE)?\b/) ?? text.match(/\bG(?:AUGE)?\s?(\d{2})\b/);
  const fr = text.match(/\bFR\.?\s?(\d{1,2})\b/);
  const size = gauge ? `${gauge[1]}G` : fr ? `FR${fr[1]}` : '';
  if (size) set(DIM1, size, 'Hospital description', `${gauge?.[0].trim() ?? fr?.[0].trim()} is in the description.`);
  if (age) {
    if (out[DIM1]) set(DIM2, age.value, 'Hospital description', `"${age.said}" is in the description.`);
    else set(DIM1, age.value, 'Hospital description', `"${age.said}" is in the description; the team writes it in DIMENSION/SIZE (1) (${age.n} rows).`);
  }
  const len = text.match(/\b(\d+(?:\.\d+)?)\s?(MM|CM)\b/);
  if (len) set('LENGTH (1)', `${len[1]}${len[2]}`, 'Hospital description', `${len[0].trim()} is in the description.`);
  if (/\bNON[\s-]?STERILE\b/.test(text)) set('STERILE/NON STERILE', 'NON STERILE', 'Hospital description', 'It says non-sterile.');
  else if (/\bSTERILE\b/.test(text)) set('STERILE/NON STERILE', 'STERILE', 'Hospital description', 'It says sterile.');
  if (/\bLATEX[\s-]?FREE\b/.test(text)) set('LATEX FREE/LATEX', 'LATEX FREE', 'Hospital description', 'It says latex free.');
  if (/\b(?:DISPOSABLE|SINGLE[\s-]?USE)\b/.test(text)) set('DISPOSABLE/REUSABLE', 'DISPOSABLE', 'Hospital description', 'It says disposable / single use.');
  else if (/\bREUSABLE\b/.test(text)) set('DISPOSABLE/REUSABLE', 'REUSABLE', 'Hospital description', 'It says reusable.');

  // TYPE is often not written by the hospital; the Excel shows which TYPE goes with an ITEM_TYPE
  const it = out[ITYPE]?.value;
  const rule = it ? VOCAB[cfg.id]?.typeGivenItemType[it] : undefined;
  if (rule && !out[TYPE]) set(TYPE, rule[0], 'Excel rule', `In ${rule[1]} of ${rule[2]} Excel rows with ITEM_TYPE ${it}, the TYPE is ${rule[0]}. Check that it fits.`);
  return out;
}
