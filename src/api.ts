import { supabase } from './lib/supabase';
import { PAGE_SIZE } from './state';
import type { Analytics, ExportKind, HospitalStat, Item, ItemDetail, Stats, Submission, WebResult, LabLookup, LabSearch, UnspscRow } from './types';

const COLS = 'item_id,hospital_name,hospital_desc,category,mph_code,mph_short,new_short,status,priority,remarks';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** Strip characters that would break a PostgREST filter string. */
const clean = (s: string): string => s.replace(/[,()%*\\]/g, ' ').trim();

export async function fetchStats(): Promise<Stats> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(supabase.rpc('dashboard_stats').abortSignal(controller.signal)).then(result => ok<Stats>(result)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Dashboard request timed out. Check your connection and try again.'));
          controller.abort();
        }, 20000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function fetchAnalytics(): Promise<Analytics> {
  return ok<Analytics>(await supabase.rpc('dashboard_analytics').abortSignal(AbortSignal.timeout(20000)));
}

export async function fetchHospitalStats(): Promise<HospitalStat[]> {
  return ok<HospitalStat[]>(await supabase.rpc('dashboard_hospitals').abortSignal(AbortSignal.timeout(20000)));
}

export async function fetchHospitals(): Promise<string[]> {
  return ok<string[]>(await supabase.rpc('hospital_list').abortSignal(AbortSignal.timeout(20000)));
}

export async function fetchQueue(p: { status: string; q: string; page: number }, withData = false): Promise<{ rows: Item[]; total: number }> {
  let qb = supabase.from('items').select(withData ? `${COLS},pasia_data` : COLS, { count: 'exact' }).order('created_at', { ascending: false }).order('item_id', { ascending: false });
  if (p.status) qb = qb.eq('status', p.status);
  const q = clean(p.q);
  if (q) qb = qb.or(`item_id.ilike.%${q}%,hospital_desc.ilike.%${q}%,mph_short.ilike.%${q}%,new_short.ilike.%${q}%`);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count, error } = await qb.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as Item[], total: count ?? 0 };
}

export async function fetchItem(id: string): Promise<ItemDetail | null> {
  const cols = `${COLS},hospital_code,supplier,mph_long,unspsc_commodity,unspsc_title,change_category,mph_data,pasia_data`;
  return ok<ItemDetail | null>(await supabase.from('items').select(cols).eq('item_id', id).maybeSingle());
}

export interface MatchRow {
  item_id: string;
  mph_code: string | null;
  category: string | null;
  mph_short: string | null;
  mph_long: string | null;
  unspsc_commodity: string | null;
  hospital_name?: string | null;
  hospital_desc?: string | null;
  score: number;
}
export async function searchMaster(q: string): Promise<MatchRow[]> {
  return ok<MatchRow[]>(await supabase.rpc('find_matches', { q, n: 10 }));
}

/** Rows that already have exactly this short description (as the master's or as a proposal). */
export async function fetchDuplicates(short: string): Promise<{ mph_code: string | null; mph_short: string | null }[]> {
  const [a, b] = await Promise.all([
    supabase.from('items').select('mph_code,mph_short').eq('mph_short', short).limit(5),
    supabase.from('items').select('mph_code,mph_short:new_short').eq('new_short', short).limit(5),
  ]);
  return [...ok<{ mph_code: string | null; mph_short: string | null }[]>(a), ...ok<{ mph_code: string | null; mph_short: string | null }[]>(b)].slice(0, 5);
}

export interface NewRequest {
  hospital_name: string;
  hospital_desc: string;
  category?: string;
  mph_code?: string;
  mph_short?: string;
  new_short?: string;
  new_long?: string;
  unspsc_commodity?: string;
  status: 'Pending QA' | 'Mapped';
  remarks?: string;
  pasia_data?: Record<string, unknown>;
}
export async function insertRequest(rec: NewRequest): Promise<string> {
  const rows = ok<{ item_id: string }[]>(await supabase.from('items').insert(rec).select('item_id'));
  return rows[0]?.item_id ?? '';
}

/** The slug Supabase gave the deployed function (shown in Edge Functions). */
const WEB_LOOKUP_FUNCTION = 'bright-handler';

/** Ask the server to find proof for this item on the web (Gemini + Google Search). */
export async function webLookup(p: { description: string; hospital: string; noun: string; type: string; columns?: string[] }): Promise<WebResult> {
  const { data, error } = await supabase.functions.invoke(WEB_LOOKUP_FUNCTION, { body: p });
  if (error) {
    let m = error.message;
    try {
      const b = await (error as unknown as { context?: Response }).context?.json();
      if (b && typeof b.error === 'string') m = b.error;
    } catch { /* keep the default message */ }
    throw new Error(m);
  }
  if (data && typeof data.error === 'string') throw new Error(data.error);
  return data as WebResult;
}

const SCRAPER_URL = (import.meta.env.VITE_SCRAPER_URL as string | undefined) ?? 'http://localhost:8000';

/** Rules Lab: read product pages with the local scraper (scraper/ folder). Same result shape as webLookup. */
export async function scrapeLookup(p: { description: string; columns: string[]; urls: string[] }): Promise<LabLookup> {
  let res: Response;
  try {
    res = await fetch(`${SCRAPER_URL}/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  } catch {
    throw new Error('The scraper is not running. Start it from the scraper folder (see scraper/README.md).');
  }
  const b = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof b.detail === 'string' ? b.detail : `Scraper error ${res.status}`);
  return b as LabLookup;
}

/** Production sends an AI-filled proposal to QA: the descriptions, the attribute columns with their proofs, and the new status. */
export async function saveProposal(id: string, p: { new_short: string; new_long: string; pasia_data: Record<string, unknown> }): Promise<void> {
  const rows = ok<{ item_id: string }[]>(await supabase.from('items').update({ ...p, status: 'Pending QA' }).eq('item_id', id).select('item_id'));
  if (!rows.length) throw new Error('You are not allowed to change this item, or it no longer exists.');
}

export async function setStatus(id: string, status: string): Promise<void> {
  const rows = ok<{ item_id: string }[]>(await supabase.from('items').update({ status }).eq('item_id', id).select('item_id'));
  if (!rows.length) throw new Error('You are not allowed to change this item, or it no longer exists.');
}

/** All rows for an export. The API returns at most 1,000 per request, so page through. */
export async function fetchExport(kind: ExportKind): Promise<Item[]> {
  const out: Item[] = [];
  for (let from = 0; ; from += 1000) {
    let qb = supabase.from('items').select(`${COLS},new_long`).order('item_id');
    if (kind === 'tickets') qb = qb.eq('status', 'FOR HOSPITAL TICKET');
    else qb = qb.in('status', ['Approved', 'Mapped']);
    if (kind === 'new') qb = qb.like('item_id', 'REQ-%');
    const rows = ok<Item[]>(await qb.range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function fetchSubmissions(): Promise<Submission[]> {
  return ok<Submission[]>(await supabase.from('submissions').select('id,kind,row_count,sent_by_name,sent_at,feedback').order('sent_at', { ascending: false }).limit(20));
}

export async function insertSubmission(kind: string, rowCount: number, by: string): Promise<void> {
  ok(await supabase.from('submissions').insert({ kind, row_count: rowCount, sent_by_name: by }));
}

/** Rules Lab: Firecrawl search through the local scraper. The pages found, and every value found per column with its proof. */
export async function labSearch(p: { description: string; columns: string[]; urls: string[] }): Promise<LabSearch> {
  const r = (await scrapeLookup(p)) as LabLookup & Partial<LabSearch>;
  return { product: r.product ?? '', results: r.results ?? [], items: r.items ?? [], skipped: 0, queries: [] };
}

const UNSPSC_COLS = 'code,title,definition,class_title,family_title,segment_title';

/** Best commodities in the official UNSPSC list for a description (medical supplies preferred). */
export async function unspscSearch(q: string, n = 6): Promise<UnspscRow[]> {
  return ok<UnspscRow[]>(await supabase.rpc('unspsc_search', { q, n }));
}

/** The official entries for these codes; a code missing from the result is not in the UNSPSC list. */
export async function unspscGet(codes: string[]): Promise<UnspscRow[]> {
  if (!codes.length) return [];
  return ok<UnspscRow[]>(await supabase.from('unspsc').select(UNSPSC_COLS).in('code', codes));
}
