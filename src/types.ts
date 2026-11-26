export type ViewId = 'dash' | 'review' | 'new' | 'import' | 'qa' | 'guides' | 'submit' | 'lab';
export type Role = 'prod' | 'qa';

/** Status values as stored in the database. */
export const STATUSES = ['Ongoing Review', 'FOR MPH VALIDATION', 'FOR HOSPITAL TICKET', 'Pending QA', 'Returned', 'Approved', 'Mapped'] as const;
export type ExportKind = 'master' | 'new' | 'tickets';

export interface Sample {
  h: string;
  t: string;
}

export interface MatchReason {
  ok: boolean;
  text: string;
}

/** A master item returned by the matcher. */
export interface Match {
  itemId: string;
  code: string;
  cat: string;
  short: string;
  long: string;
  unspsc: string;
  score: number;
  why: MatchReason[];
}

/** What kind of item this is: Noun;Type, MPH category and UNSPSC commodity. */
export interface Classification {
  noun: string;
  type: string;
  category: string;
  unspsc: string;
  why: string;
}

/** One row of public.items (the columns the portal lists). */
export interface Item {
  item_id: string;
  hospital_name: string | null;
  hospital_desc: string | null;
  category: string | null;
  mph_code: string | null;
  mph_short: string | null;
  new_short: string | null;
  new_long?: string | null;
  status: string | null;
  priority: string | null;
  remarks: string | null;
  /** Only loaded for the QA list: the attribute columns, with the AI's proofs under AI_PROOF. */
  pasia_data?: Record<string, unknown>;
}

/** A full row of public.items, as shown in the review detail. */
export interface ItemDetail extends Item {
  hospital_code: string | null;
  supplier: string | null;
  mph_long: string | null;
  unspsc_commodity: string | null;
  unspsc_title: string | null;
  change_category: string | null;
  mph_data: Record<string, string>;
  pasia_data: Record<string, unknown>;
}

export interface Submission {
  id: number;
  kind: string;
  row_count: number;
  sent_by_name: string | null;
  sent_at: string;
  feedback: string | null;
}

export interface Descriptions {
  short: string;
  long: string;
}

export interface Stats {
  total: number;
  optima: number;
  optima_done: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
}

/** From dashboard_analytics(): breakdowns by status, and what the audit log says happened day by day. */
export interface Analytics {
  category_status: { k: string; status: string; n: number }[];
  priority_status: { k: string; status: string; n: number }[];
  daily: { day: string; approved: number; changes: number }[];
  qa_approved: number;
  qa_returned: number;
}

export interface HospitalStat {
  k: string;
  total: number;
  approved: number;
  open: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

/** One attribute found on the web, with the pages Google linked it to. */
export interface WebItem {
  column: string;
  value: string;
  quote: string;
  sources: { url: string; site: string }[];
}

export interface WebResult {
  product: string;
  items: WebItem[];
  skipped: number;
  queries: string[];
}

/** One page the scraper found for a hospital item, with the values read from it and why it may be the right one. */
export interface LabCandidate {
  url: string;
  site: string;
  title: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  remarks: string[];
  items: WebItem[];
  /** false: an article or guide, never used as proof */
  product_page?: boolean | null;
}

/** Rules Lab search: the pages Google used, and every value found with its proof (a column can have several). */
export interface LabSearch {
  product: string;
  results: { url: string; site: string; title: string; snippet: string; confidence?: 'High' | 'Medium' | 'Low'; product_page?: boolean | null }[];
  items: WebItem[];
  skipped: number;
  queries: string[];
}

/** One code from the official UNSPSC list. */
export interface UnspscRow {
  code: string;
  title: string;
  definition: string | null;
  class_title: string | null;
  family_title: string | null;
  segment_title: string | null;
}

/** A match from the official list, and what found it: the hospital description, the product name from the web, or both. */
export type UnspscMatch = UnspscRow & { via: 'description' | 'web' | 'both' };

/** Rules Lab UNSPSC check. The web says what the product is; the official list gives the code; codes printed on pages are checked. */
export interface LabUnspsc {
  phase: 'idle' | 'loading' | 'done';
  web: { code: string; quote: string; sources: { url: string; site: string }[]; row: UnspscRow | null }[];
  matches: UnspscMatch[];
  /** The product name from the web the list was searched with ('' until Firecrawl answers, or when it found none). */
  product: string;
  chosen: string;
  error: string;
}

export interface LabLookup {
  how: string;
  tried: number;
  candidates: LabCandidate[];
}

/** Proof saved with an attribute value. */
export interface Proof {
  value: string;
  url: string;
  site: string;
  quote: string;
}
