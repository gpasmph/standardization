import type { ImportRow } from './lib/excelMap';
import type { Analytics, HospitalStat, LabSearch, LabUnspsc, Classification, Proof, WebResult, ExportKind, Item, ItemDetail, Match, Role, Sample, Stats, Submission, User, ViewId } from './types';

import type { AiState } from './lib/aiFill';

export interface ReviewAi extends AiState { id: string | null; phase: 'idle' | 'loading' | 'done' }
export const freshReviewAi = (): ReviewAi => ({ raw: {}, proofs: {}, status: '', lookup: null, error: '', id: null, phase: 'idle' });

export interface Queue {
  rows: Item[];
  total: number;
  page: number;
  status: string; // '' = all
  q: string;
  loading: boolean;
}

const queue = (status = ''): Queue => ({ rows: [], total: 0, page: 1, status, q: '', loading: false });

export interface ImportState {
  phase: 'idle' | 'parsing' | 'ready' | 'importing' | 'done';
  fileName: string;
  progress: number;
  rows: ImportRow[];
  dupes: number;
  layout: 'working' | 'master' | null;
  mode: 'new' | 'update';
  done: number;
}

export const freshImport = (): ImportState => ({ phase: 'idle', fileName: '', progress: 0, rows: [], dupes: 0, layout: null, mode: 'new', done: 0 });

export interface State {
  authReady: boolean;
  user: User | null;
  role: Role;
  hospitals: string[];
  view: ViewId;
  stats: Stats | null;
  statsLoading: boolean;
  statsError: string;
  /** Dashboard analytics; null until loaded, and stays null if the SQL for it was not run (the dashboard falls back). */
  analytics: Analytics | null;
  hospitalStats: HospitalStat[] | null;
  analyticsLoading: boolean;
  // New item wizard
  step: 1 | 2 | 3 | 4 | 5;
  input: Sample;
  matches: Match[];
  chosen: Match | null;
  dups: { mph_code: string | null; mph_short: string | null }[];
  cls: Classification | null;
  vals: Record<string, string>;
  desc: { short: string; long: string; eShort: boolean; eLong: boolean };
  src: string;
  files: string[];
  web: { phase: 'idle' | 'loading' | 'done'; result: WebResult | null };
  proofs: Record<string, Proof>;
  // Review existing rows
  review: Queue & { selected: string | null; detail: ItemDetail | null; detailLoading: boolean; ai: ReviewAi };
  // QA approval (decided = this session's decisions, so they can be undone)
  qa: Queue;
  decided: Record<string, 'Approved' | 'Returned'>;
  guideTab: string;
  lab: { cat: string; hospital: string; urls: string; status: string; raw: Record<string, string>; web: { phase: 'idle' | 'loading' | 'done'; result: LabSearch | null }; proofs: Record<string, Proof>; unspsc: LabUnspsc };
  submit: { history: Submission[]; loading: boolean; kind: ExportKind; busy: boolean };
  imp: ImportState;
}

export const PAGE_SIZE = 25;

export const S: State = {
  authReady: false,
  user: null,
  role: 'prod',
  hospitals: [],
  view: 'dash',
  stats: null,
  statsLoading: false,
  statsError: '',
  analytics: null,
  hospitalStats: null,
  analyticsLoading: false,
  step: 1,
  input: { h: '', t: '' },
  matches: [],
  chosen: null,
  dups: [],
  cls: null,
  vals: {},
  desc: { short: '', long: '', eShort: false, eLong: false },
  src: '',
  files: [],
  web: { phase: 'idle', result: null },
  proofs: {},
  review: { ...queue(), selected: null, detail: null, detailLoading: false, ai: freshReviewAi() },
  qa: queue('Pending QA'),
  decided: {},
  guideTab: 'Attributes',
  lab: { cat: 'CANNULA', hospital: '', urls: '', status: '', raw: {}, web: { phase: 'idle', result: null }, proofs: {}, unspsc: freshUnspsc() },
  submit: { history: [], loading: false, kind: 'master', busy: false },
  imp: freshImport(),
};

export function freshUnspsc(): LabUnspsc { return { phase: 'idle', web: [], matches: [], product: '', chosen: '', error: '' }; }

export const freshLab = (cat: string, hospital = '', raw: Record<string, string> = {}): State['lab'] =>
  ({ cat, hospital, urls: '', status: '', raw, web: { phase: 'idle', result: null }, proofs: {}, unspsc: freshUnspsc() });

export function resetNew(): void {
  Object.assign(S, { step: 1, matches: [], chosen: null, dups: [], cls: null, vals: {}, desc: { short: '', long: '', eShort: false, eLong: false }, src: '', files: [], web: { phase: 'idle', result: null }, proofs: {}, input: { h: S.hospitals[0] ?? '', t: '' } });
}

/** Keep the dashboard / sidebar counters in step with a status change without refetching. */
export function bump(from: string | null, to: string): void {
  const by = S.stats?.by_status;
  if (!by) return;
  if (from && (by[from] ?? 0) > 0) by[from] = (by[from] ?? 0) - 1;
  by[to] = (by[to] ?? 0) + 1;
}
