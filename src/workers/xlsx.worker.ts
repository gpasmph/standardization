/**
 * Streams the .xlsx (a zip of XML files) so a 16 MB workbook never has to be held
 * in memory as 3 million cell objects. Runs off the main thread so the page stays responsive.
 */
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { detectLayout, mapRow, MAX_COLS, type ImportRow, type Layout, type WorkerMsg } from '../lib/excelMap';

const post = (m: WorkerMsg): void => self.postMessage(m);

/** Feed the text of one zip entry to onText, in chunks. Returns false if the entry doesn't exist. */
function streamEntry(zip: Uint8Array, name: string, onText: (s: string) => void): boolean {
  let found = false;
  const un = new Unzip();
  un.register(UnzipInflate);
  un.register(UnzipPassThrough);
  un.onfile = (f) => {
    if (f.name !== name) return;
    found = true;
    const dec = new TextDecoder();
    f.ondata = (err, chunk, final) => {
      if (err) throw err;
      onText(dec.decode(chunk, { stream: !final }));
    };
    f.start();
  };
  un.push(zip, true);
  return found;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? ''));

/** Run re over buf, call cb for each match, return the unmatched tail (an incomplete element). */
function drain(buf: string, re: RegExp, cb: (m: RegExpExecArray) => void): string {
  re.lastIndex = 0;
  let last = 0;
  for (let m = re.exec(buf); m; m = re.exec(buf)) { cb(m); last = re.lastIndex; }
  return buf.slice(last);
}

const SI = /<si\b[^>]*?\/>|<si\b[^>]*>[\s\S]*?<\/si>/g;
const ROW = /<row\b[^>]*?\/>|<row\b[^>]*>[\s\S]*?<\/row>/g;
const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1] ?? '';
  return decode(out);
}

const colIndex = (letters: string): number => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

self.onmessage = async (e: MessageEvent<File>): Promise<void> => {
  try {
    const zip = new Uint8Array(await e.data.arrayBuffer());

    // 1) shared strings (cells point into this list)
    const shared: string[] = [];
    let buf = '';
    streamEntry(zip, 'xl/sharedStrings.xml', (s) => { buf = drain(buf + s, SI, (m) => shared.push(textOf(m[0]))); });

    // 2) the sheet, row by row
    let headers: string[] = [];
    let batch: ImportRow[] = [];
    let n = 0;
    let failed: string | null = null;
    let layout: Layout = 'working';
    buf = '';

    const onRow = (m: RegExpExecArray): void => {
      if (failed) return;
      const rowNo = Number(/\br="(\d+)"/.exec(m[0].slice(0, m[0].indexOf('>')))?.[1] ?? 0);
      if (rowNo < 2) return;
      const cells: (string | null)[] = [];
      for (const c of m[0].matchAll(CELL)) {
        const attrs = c[1] ?? '';
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
        if (!ref) continue;
        const t = /\bt="(\w+)"/.exec(attrs)?.[1];
        const inner = c[2] ?? '';
        let val: string | null = null;
        if (t === 'inlineStr') val = textOf(inner);
        else if (t !== 'e') {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (v !== undefined) val = t === 's' ? (shared[Number(v)] ?? null) : decode(v);
        }
        val = val?.trim() || null;
        cells[colIndex(ref)] = val;
      }
      if (rowNo === 2) {
        headers = Array.from({ length: Math.max(cells.length, MAX_COLS) }, (_, i) => cells[i] ?? '');
        const found = detectLayout(headers);
        if ('error' in found) failed = found.error; else { layout = found.layout; post({ type: 'layout', layout }); }
        return;
      }
      const rec = mapRow(cells, headers, layout);
      if (!rec) return;
      batch.push(rec);
      n++;
      if (batch.length >= 1000) { post({ type: 'rows', rows: batch }); batch = []; post({ type: 'progress', n }); }
    };

    const ok = streamEntry(zip, 'xl/worksheets/sheet1.xml', (s) => { buf = drain(buf + s, ROW, onRow); });
    if (!ok) throw new Error('Could not find the first sheet in this file. Is it a real .xlsx?');
    if (failed) throw new Error(failed);
    if (batch.length) post({ type: 'rows', rows: batch });
    post({ type: 'progress', n });
    post({ type: 'done' });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Could not read the file' });
  }
};
