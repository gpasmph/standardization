// Supabase Edge Function: find proof on the web for a hospital item's attributes, using Gemini + Google Search grounding.
//
// Rules this function enforces:
//  - only signed-in portal users can call it
//  - the API key stays here (secret GEMINI_API_KEY), never in the browser
//  - an attribute is returned ONLY if Google's grounding linked it to a real source page.
//    URLs come from Google's grounding metadata, never from text the model wrote.
import { createClient } from 'npm:@supabase/supabase-js@2';

const COLUMNS = [
  'NOUN', 'TYPE', 'MANUFACTURER', 'MANUFACTURE ITEM CODE', 'ITEM BRAND/MODEL', 'EQUIPMENT BRAND/ MODEL',
  'MATERIAL/COMPOSITION (1)', 'MATERIAL/COMPOSITION (2)', 'DIMENSION/SIZE (1)', 'DIMENSION/SIZE (2)', 'DIMENSION/SIZE (3)',
  'LENGTH (1)', 'LENGTH (2)', 'LENGTH (3)', 'LENGTH (4)', 'SHAPE', 'COLOR', 'DIAMETER', 'ANGLE', 'CONFIGURATION',
  'NO. OF ITEMS', 'UOM', 'ITEM_TYPE', 'LATEX FREE/LATEX', 'DISPOSABLE/REUSABLE', 'STERILE/NON STERILE',
  'OTHER ATTRIBUTES (1)', 'OTHER ATTRIBUTES (2)', 'OTHER ATTRIBUTES (3)',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Chunk { web?: { uri?: string; title?: string } }
interface Support { segment?: { startIndex?: number; endIndex?: number }; groundingChunkIndices?: number[] }

/** Google returns redirect links; follow one hop so the analyst sees the real page. */
async function resolve(uri: string): Promise<string> {
  try {
    const r = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    const loc = r.headers.get('location');
    return loc && /^https?:\/\//i.test(loc) ? loc : uri;
  } catch {
    return uri;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // 1) must be a signed-in user
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: 'Please sign in again.' }, 401);

    // 2) input
    const body = await req.json().catch(() => ({})) as { description?: string; hospital?: string; noun?: string; type?: string; columns?: string[] };
    const description = (body.description ?? '').trim().slice(0, 400);
    if (description.length < 3) return json({ error: 'The hospital description is empty.' }, 400);

    // only the columns that apply to this kind of item (the caller's list, limited to the known columns)
    const wanted = Array.isArray(body.columns) ? COLUMNS.filter((c) => body.columns?.includes(c)) : [];
    const cols = wanted.length ? wanted : COLUMNS;

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY is not set on the server.' }, 500);
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';

    // 3) ask Gemini, with Google Search grounding
    const prompt = `You help a hospital supply master-data team standardize item records.
Hospital item description: "${description}"
${body.hospital ? `Hospital: ${body.hospital}\n` : ''}${body.noun ? `Known so far: Noun ${body.noun}, Type ${body.type ?? ''}.\n` : ''}
Use Google Search to find the manufacturer's or supplier's product page, catalogue or datasheet for this exact item.
Then list the attributes that a page you found actually states.

Output rules (follow exactly, no other text):
- First line: PRODUCT: <product name as written on the page>
- Then one attribute per line in this form: COLUMN: VALUE | "short quote from the page"
- COLUMN must be one of: ${cols.join('; ')}
- Only include an attribute if a page states it. Never guess or infer. Leave out anything you cannot find.
- VALUE in CAPITAL LETTERS, with units like 22G or 25MM.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 500);
      // keep Google's own message: for a 429 it says which quota was hit (per minute, per day, or Search grounding not in the free tier)
      return json({ error: `Google API error ${res.status}. ${detail}` }, 502);
    }
    const data = await res.json();
    const cand = data.candidates?.[0];
    const text: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    const gm = cand?.groundingMetadata as { groundingChunks?: Chunk[]; groundingSupports?: Support[]; webSearchQueries?: string[] } | undefined;
    const chunks = gm?.groundingChunks ?? [];
    const supports = gm?.groundingSupports ?? [];

    // 4) read the lines; link each to the sources Google attached to that part of the text
    const enc = new TextEncoder();
    const resolved = new Map<number, Promise<string>>();
    const urlOf = (i: number): Promise<string> => {
      if (!resolved.has(i)) resolved.set(i, resolve(chunks[i]?.web?.uri ?? ''));
      return resolved.get(i) as Promise<string>;
    };

    let product = '';
    let skipped = 0;
    const items: { column: string; value: string; quote: string; sources: { url: string; site: string }[] }[] = [];
    let offset = 0; // byte offset of the current line (Google's segment indexes are bytes)
    for (const line of text.split('\n')) {
      const start = offset;
      const end = start + enc.encode(line).length;
      offset = end + 1;
      const m = /^\s*([A-Z][A-Z0-9 /_.()-]*?)\s*:\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const column = (m[1] ?? '').trim().toUpperCase();
      const rest = m[2] ?? '';
      if (column === 'PRODUCT') { product = rest.replace(/\s*\|.*$/, '').trim(); continue; }
      if (!cols.includes(column)) continue;
      const [valuePart = '', quotePart = ''] = rest.split(/\s\|\s/);
      const value = valuePart.trim();
      if (!value) continue;

      const idx = new Set<number>();
      for (const s of supports) {
        const a = s.segment?.startIndex ?? 0;
        const b = s.segment?.endIndex ?? 0;
        if (a < end && b > start) (s.groundingChunkIndices ?? []).forEach((i) => idx.add(i));
      }
      const sources: { url: string; site: string }[] = [];
      for (const i of idx) {
        const web = chunks[i]?.web;
        if (!web?.uri) continue;
        sources.push({ url: await urlOf(i), site: web.title ?? '' });
      }
      if (!sources.length) { skipped++; continue; } // no proof: not returned
      items.push({ column, value, quote: quotePart.replace(/^["“]|["”]$/g, '').trim(), sources: sources.slice(0, 3) });
    }

    return json({ product, items, skipped, queries: gm?.webSearchQueries ?? [], model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
