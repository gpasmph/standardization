import { ATTRS } from '../data/attributes';
import { SHORT_LIMIT } from './describe';
import type { CategoryConfig, Finding } from './types';

const BAD_PART = /^(0|#N\/A|N\/A|NA|NONE|NULL|UNDEFINED)$/;

/** Checks that apply to any description, whoever wrote it. */
export function checkDescription(kind: 'short' | 'long', s: string, limit = SHORT_LIMIT): Finding[] {
  const name = kind === 'short' ? 'Short description' : 'Long description';
  if (!s) return [{ level: 'error', msg: `${name} is empty.` }];
  const f: Finding[] = [];
  if (s !== s.toUpperCase()) f.push({ level: 'error', msg: `${name} must be in capital letters.` });
  if (/;\s|\s;/.test(s)) f.push({ level: 'warn', msg: `${name}: no spaces next to ";" (write A;B, not A; B).` });
  if (/;;|^;|;$/.test(s)) f.push({ level: 'error', msg: `${name} has an empty part.` });
  const bad = s.split(';').map((p) => p.trim()).filter((p) => BAD_PART.test(p));
  if (bad.length) f.push({ level: 'error', msg: `${name} has a placeholder part: ${bad.join(', ')}.` });
  if (kind === 'short' && s.length > limit) f.push({ level: 'error', msg: `Short description is ${s.length} characters; the limit is ${limit}.` });
  return f;
}

export function validate(cfg: CategoryConfig, vals: Record<string, string>, short: string, long: string): Finding[] {
  const f: Finding[] = [];
  for (const col of cfg.required) if (!vals[col]) f.push({ level: 'error', col, msg: `${col} is required.` });
  for (const a of ATTRS) {
    const v = vals[a.col];
    if (v && a.options && !a.options.includes(v)) f.push({ level: 'error', col: a.col, msg: `${a.col} must be one of: ${a.options.join(', ')}.` });
  }
  for (const col of Object.keys(vals)) {
    if (!cfg.ask.includes(col) && !cfg.required.includes(col)) f.push({ level: 'info', col, msg: `${col} is not usually filled for ${cfg.label}. Keep it only if it really applies.` });
  }
  f.push(...checkDescription('short', short), ...checkDescription('long', long));
  return f;
}
