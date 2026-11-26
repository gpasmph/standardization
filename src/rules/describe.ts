import type { CategoryConfig } from './types';

export const SHORT_LIMIT = 40;

interface Part { col: string; v: string }

/** Keep the first time a value shows up, e.g. a brand that is the same as the manufacturer is written once. */
function parts(cols: string[], vals: Record<string, string>): Part[] {
  const seen = new Set<string>();
  const out: Part[] = [];
  for (const col of cols) {
    const v = (vals[col] ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push({ col, v });
  }
  return out;
}

const text = (p: Part[]): string => p.map((x) => x.v).join(';');

/**
 * Long: every part, in the category's order.
 * Short: the same idea, but when it is over the limit the least important parts are dropped one by one,
 * so NOUN;TYPE stay and nothing is cut in the middle of a word.
 */
export function buildDescriptions(cfg: CategoryConfig, vals: Record<string, string>, limit = SHORT_LIMIT): { short: string; long: string } {
  const long = text(parts(cfg.long, vals));
  const short = parts(cfg.short, vals);
  const rank = (col: string): number => {
    const i = cfg.shortPriority.indexOf(col);
    return i < 0 ? Infinity : i;
  };
  const keep = new Set(cfg.shortPriority.slice(0, 2));
  while (text(short).length > limit) {
    let drop = -1;
    short.forEach((p, i) => {
      if (keep.has(p.col)) return;
      if (drop < 0 || rank(p.col) >= rank(short[drop]!.col)) drop = i;
    });
    if (drop < 0) break;
    short.splice(drop, 1);
  }
  return { short: text(short), long };
}
