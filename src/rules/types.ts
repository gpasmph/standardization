/** What the rules need to know about one kind of item. Plain data, so each category is easy to review and change. */
export interface CategoryConfig {
  id: string;
  label: string;
  /** The Noun this category always uses (used to pre-fill NOUN). */
  noun?: string;
  /** Excel columns (exact headers) the lookup should try to fill. Anything else is skipped as "not applicable". */
  ask: string[];
  /** Order of the parts in the long description. */
  long: string[];
  /** Order of the parts in the short description. */
  short: string[];
  /** Most important first. When the short description is over the limit, the last ones are dropped first. */
  shortPriority: string[];
  required: string[];
  notes: string[];
}

export type Level = 'error' | 'warn' | 'info';

export interface Finding {
  level: Level;
  col?: string;
  msg: string;
}

export interface Change {
  col: string;
  from: string;
  to: string;
}

export interface Standardized {
  vals: Record<string, string>;
  changes: Change[];
  short: string;
  long: string;
  findings: Finding[];
}
