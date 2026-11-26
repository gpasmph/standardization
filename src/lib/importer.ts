import type { ImportRow, Layout, WorkerMsg } from './excelMap';
import { supabase } from './supabase';

/** Read the .xlsx in a background worker; resolves with every row found. */
export function parseExcel(file: File, onProgress: (n: number) => void, onLayout: (l: Layout) => void = () => {}): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../workers/xlsx.worker.ts', import.meta.url), { type: 'module' });
    const rows: ImportRow[] = [];
    w.onmessage = (e: MessageEvent<WorkerMsg>): void => {
      const m = e.data;
      if (m.type === 'rows') rows.push(...m.rows);
      else if (m.type === 'layout') onLayout(m.layout);
      else if (m.type === 'progress') onProgress(m.n);
      else if (m.type === 'done') { w.terminate(); resolve(rows); }
      else { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e): void => { w.terminate(); reject(new Error(e.message || 'Could not read the file')); };
    w.postMessage(file);
  });
}

const BATCH = 500;

/** mode "new": existing Request IDs are left alone. mode "update": they are overwritten with the Excel's values. */
export async function importRows(rows: ImportRow[], mode: 'new' | 'update', onProgress: (done: number) => void): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('items').upsert(rows.slice(i, i + BATCH), { onConflict: 'item_id', ignoreDuplicates: mode === 'new' });
    if (error) throw new Error(`Stopped at row ${i + 1}: ${error.message}`);
    onProgress(Math.min(i + BATCH, rows.length));
  }
}
