import { scrapeLookup } from '../api';
import { categoryById } from '../rules';
import { proposeFromDescription } from '../rules/infer';
import type { LabLookup, Proof } from '../types';

/** What the AI filled for one hospital item: the values, where each came from, and the pages it found. */
export interface AiState {
  raw: Record<string, string>;
  proofs: Record<string, Proof>;
  status: string;
  lookup: LabLookup | null;
  error: string;
}

export const emptyAi = (): AiState => ({ raw: {}, proofs: {}, status: '', lookup: null, error: '' });

const msg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');

/**
 * Fills every column it can from the hospital item alone:
 *  1) the description and the team's Excel rules (instant),
 *  2) the best product page found on the web (High or Medium match; flagged).
 * Values already in `base` (typed by a person) are never overwritten. Nothing is guessed: no proof, no value.
 */
export async function aiFill(
  catId: string, text: string, urls: string[],
  base: Pick<AiState, 'raw' | 'proofs'> = { raw: {}, proofs: {} },
  onText?: (s: AiState) => void,
): Promise<AiState> {
  const cfg = categoryById(catId);
  const st: AiState = { raw: { ...base.raw }, proofs: { ...base.proofs }, status: '', lookup: null, error: '' };
  const fill = (col: string, value: string, site: string, url: string, quote: string): void => {
    if ((st.raw[col] ?? '').trim()) return;
    st.raw[col] = value;
    st.proofs[col] = { value, url, site, quote };
  };
  const count = (): number => Object.values(st.raw).filter((v) => v.trim()).length;

  for (const [col, p] of Object.entries(proposeFromDescription(cfg, text))) fill(col, p.value, p.from, '', p.note);
  const n0 = count();
  const first = `From the description and the Excel rules: ${n0} column${n0 === 1 ? '' : 's'}.`;
  st.status = `${first} Searching the web…`;
  onText?.({ ...st });

  try {
    const res = await scrapeLookup({ description: text, columns: ['NOUN', ...cfg.ask], urls });
    st.lookup = res;
    const top = res.candidates.find((c) => c.product_page !== false);
    const usable = !!top && top.confidence !== 'Low' && top.items.length > 0;
    if (usable) for (const it of top.items) fill(it.column, it.value, top.site, top.url, `${top.confidence} match. ${it.quote}`);
    const n = res.candidates.length;
    st.status = `${first} From the web: ${n} page${n === 1 ? '' : 's'} found`
      + (usable ? `, the best one (${top.confidence} match) added ${count() - n0} more.`
        : top ? ', but none matched well enough to fill automatically.' : '.');
  } catch (e) {
    st.error = msg(e);
    st.status = `${first} The web search failed.`;
  }
  return st;
}
