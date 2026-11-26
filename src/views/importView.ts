import { icon } from '../components/icons';
import { banner, chip, pageHead } from '../components/status';
import { esc } from '../lib/dom';
import { S } from '../state';

const fmt = (n: number): string => n.toLocaleString('en-US');

function counts(key: 'status' | 'category'): [string, number][] {
  const m = new Map<string, number>();
  for (const r of S.imp.rows) m.set(r[key] ?? '—', (m.get(r[key] ?? '—') ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function ready(): string {
  const i = S.imp;
  const st = counts('status');
  const cats = counts('category');
  const sample = i.rows.slice(0, 5).map((r) => `<tr><td><b>${esc(r.item_id ?? '')}</b></td><td>${esc(r.hospital_name ?? '')}</td><td>${esc(r.hospital_desc ?? '')}</td><td>${esc(r.category ?? '')}</td><td>${chip(r.status)}</td></tr>`).join('');
  return `<section class="panel"><h2>${esc(i.fileName)}</h2>
      <dl class="kv"><dt>File type</dt><dd>${i.layout === 'master' ? 'Vertical master data (MedSupplies&amp;Others)' : 'MPH working Excel'}</dd><dt>Rows found</dt><dd>${fmt(i.rows.length)}</dd>
      <dt>Categories</dt><dd>${fmt(cats.length)}</dd>
      <dt>By status</dt><dd>${st.map(([s, n]) => `${chip(s)} ${fmt(n)}`).join(' &nbsp; ')}</dd>
      ${i.dupes ? `<dt>Repeated IDs</dt><dd>${fmt(i.dupes)} (the last one is used)</dd>` : ''}</dl>
      <label class="f" for="impmode">If a Request ID is already in the database</label>
      <select id="impmode"><option value="new"${i.mode === 'new' ? ' selected' : ''}>Skip it, only add new rows (safe)</option>
        <option value="update"${i.mode === 'update' ? ' selected' : ''}>Overwrite it with the Excel values</option></select>
      <div class="btns"><button class="btn primary" id="doimport">Import ${fmt(i.rows.length)} rows</button><button class="btn" id="impreset">Choose another file</button></div></section>
    <section class="panel flush tablewrap"><div class="panel-head"><h2>First 5 rows</h2></div>
      <table><thead><tr><th>Request ID</th><th>Hospital</th><th>Hospital description</th><th>Category</th><th>Status</th></tr></thead><tbody>${sample}</tbody></table></section>`;
}

export function vImport(): string {
  const i = S.imp;
  const at = { idle: 1, parsing: 1, ready: 2, importing: 3, done: 4 }[i.phase];
  const steps = ['Upload', 'Review rows', 'Import'].map((l, k) => `<span class="step"><span class="dot${k + 1 < at ? ' done' : k + 1 === at ? ' now' : ''}">${k + 1 < at ? '✓' : k + 1}</span>${l}</span>`).join('');
  const head = `${pageHead('Batch import', 'Load the MPH working Excel or the vertical master data straight into the database. You see what is in the file before anything is saved.')}<div class="stepbar">${steps}</div>`;
  if (S.role !== 'qa') return `${head}${banner('warn', 'Only a QA reviewer can import. Ask QA to do it.')}`;
  switch (i.phase) {
    case 'idle': return `${head}<section class="panel"><label class="pick">
        <input type="file" id="xlsx" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        <span class="drop-icon">${icon('upload', 28)}</span><b>Choose the working Excel or master data (.xlsx)</b>
        <span class="hint">Either “MPH - Working Excel” (88 columns) or MASTERDATA-VERTICAL (first sheet, 95 columns). Headers on row 2. The layout is detected for you, and you can review it before anything is saved.</span></label></section>`;
    case 'parsing': return `${head}<section class="panel"><h2>Reading ${esc(i.fileName)}…</h2>
        <p class="hint">${fmt(i.progress)} rows read so far. Nothing is saved yet.</p></section>`;
    case 'ready': return head + ready();
    case 'importing': {
      const pct = Math.round((i.done / Math.max(1, i.rows.length)) * 100);
      return `${head}<section class="panel"><h2>Importing…</h2><div class="progress"><div style="width:${pct}%"></div></div>
        <p class="hint">${fmt(i.done)} of ${fmt(i.rows.length)} rows. Keep this page open.</p></section>`;
    }
    case 'done': return `${head}<section class="panel"><div class="banner good"><b>Done.</b> ${fmt(i.rows.length)} rows were sent to the database${i.mode === 'new' ? '; Request IDs that already existed were skipped' : ''}.</div>
        <div class="btns"><button class="btn primary" data-v="queue">See them in the Review queue</button><button class="btn" id="impreset">Import another file</button></div></section>`;
  }
}
