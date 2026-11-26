import { buildDescriptions } from './describe';
import { normalizeAll } from './normalize';
import type { CategoryConfig, Standardized } from './types';
import { validate } from './validate';

export { CATEGORIES, categoryById } from './categories';
export { SHORT_LIMIT } from './describe';
export type { CategoryConfig, Finding, Standardized } from './types';

/** Raw values in; clean values, both descriptions and findings out. Pure: no DOM, no network. */
export function standardize(cfg: CategoryConfig, raw: Record<string, string>): Standardized {
  const { vals, changes } = normalizeAll(raw);
  const { short, long } = buildDescriptions(cfg, vals);
  return { vals, changes, short, long, findings: validate(cfg, vals, short, long) };
}
