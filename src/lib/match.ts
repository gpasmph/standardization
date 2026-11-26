import { searchMaster, type MatchRow } from '../api';
import { CATEGORY_MAP } from '../data/guides';
import type { Classification, Match, MatchReason } from '../types';

/** Normalise hospital shorthand: g22 → 22G, 1 inch → 25MM, 3/4 in → 19MM. */
export function norm(t: string): string {
  return t.toUpperCase()
    .replace(/\bG\s?(\d{2})\b/g, '$1G')
    .replace(/(\d{2})\s?GA?\b/g, '$1G')
    .replace(/3\/4\s?(IN|INCH)?/g, '19MM')
    .replace(/\b1\s?(IN|INCH)\b/g, '25MM')
    .replace(/(\d+)\s?CM/g, '$1CM')
    .replace(/[^A-Z0-9/.]+/g, ' ')
    .trim();
}

/** Suggest a Noun;Type from the hospital wording (the "Category Map"). */
export function classify(text: string): Classification | null {
  const u = text.toUpperCase();
  for (const e of CATEGORY_MAP) {
    const term = e.terms.find((t) => u.includes(t));
    if (term) {
      const [noun = '', type = ''] = e.nt.split(';');
      return { noun, type, category: e.cat, unspsc: e.unspsc, why: `Hospital term “${term.toLowerCase()}” maps to ${e.nt.toLowerCase()} in the Category Map` };
    }
  }
  return null;
}

/** Hospital words that mean the same thing as the master's word. */
const ALIASES: Record<string, string[]> = { CATHETER: ['CANNULA', 'CATH'], NEEDLE: ['NDL'], SYRINGE: ['SYR'], 'W/ WINGS': ['WITH WINGS', 'WINGS', 'WINGED'] };

/** Is this part of the master description present in what the hospital wrote? */
function found(part: string, textNorm: string): boolean {
  const hay = ` ${textNorm} `;
  const p = norm(part);
  if (!p) return false;
  return [p, ...(ALIASES[p] ?? [])].some((v) => hay.includes(` ${v} `));
}

/** Split `NOUN;TYPE,ATTR,ATTR` into its parts (the master's naming sequence). */
const partsOf = (short: string): string[] => short.split(/[;,]/).map((p) => p.trim()).filter(Boolean);

const MAX_ATTRS = 4;

/**
 * A checklist of why a master row is (or isn't) a good match: same hospital wording,
 * then Noun, Type and each attribute of the master item compared with the hospital text.
 */
function reasons(text: string, row: MatchRow, hospital: string): MatchReason[] {
  const why: MatchReason[] = [];
  const n = norm(text);

  if (row.hospital_desc && norm(row.hospital_desc) === n) {
    const same = !!hospital && row.hospital_name === hospital;
    why.push({ ok: true, text: same ? `Same description from ${row.hospital_name}: already mapped` : `Same hospital description${row.hospital_name ? ` (${row.hospital_name})` : ''}` });
  } else if (hospital && row.hospital_name === hospital) {
    why.push({ ok: true, text: `Same hospital (${hospital})` });
  }

  const [noun, type, ...attrs] = partsOf(row.mph_short ?? '');
  if (noun) why.push({ ok: found(noun, n), text: `Noun: ${noun}` });
  if (type) why.push({ ok: found(type, n), text: `Type: ${type}` });
  // show the attributes that match first, then the ones missing from the hospital text
  const checked = attrs.map((a) => ({ a, ok: found(a, n) }));
  const ordered = [...checked.filter((c) => c.ok), ...checked.filter((c) => !c.ok)].slice(0, MAX_ATTRS);
  for (const c of ordered) why.push({ ok: c.ok, text: `${c.ok ? 'Attribute' : 'Not in your text'}: ${c.a}` });
  if (attrs.length > MAX_ATTRS) why.push({ ok: true, text: `+${attrs.length - MAX_ATTRS} more attributes` });
  return why;
}

/** Closest existing items in the MPH master (searched in the database). */
export async function findMatches(text: string, hospital = ''): Promise<Match[]> {
  const rows = await searchMaster(norm(text));
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const r of rows) {
    const code = r.mph_code ?? r.item_id;
    if (seen.has(code)) continue; // several hospital rows can share one MPH code: show it once
    seen.add(code);
    out.push({
      itemId: r.item_id,
      code,
      cat: r.category ?? '',
      short: r.mph_short ?? '',
      long: r.mph_long ?? '',
      unspsc: r.unspsc_commodity ?? '',
      score: Math.min(99, Math.round(r.score * 100)),
      why: reasons(text, r, hospital),
    });
    if (out.length === 3) break;
  }
  return out;
}
