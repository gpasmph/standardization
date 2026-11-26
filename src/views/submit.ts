import { skTableRows } from '../components/skeleton';
import { banner, pageHead } from '../components/status';
import { esc } from '../lib/dom';
import { inText, nextSlot } from '../lib/schedule';
import { S } from '../state';

const fmt = (n: number): string => n.toLocaleString('en-US');
const KINDS = [
  { id: 'master', name: 'Updated master', desc: 'Every approved and mapped row' },
  { id: 'new', name: 'New items only', desc: 'Items created in this portal (REQ-…)' },
  { id: 'tickets', name: 'Hospital tickets', desc: 'Rows waiting for a hospital reply' },
] as const;

export function vSubmit(): string {
  const slot = nextSlot();
  const by = S.stats?.by_status ?? {};
  const ready = (by.Approved ?? 0) + (by.Mapped ?? 0);
  const held = by['FOR MPH VALIDATION'] ?? 0;
  const qa = S.role === 'qa';
  const box = (label: string, value: string, note: string): string => `<div class="mini big"><span class="label">${label}</span><b>${value}</b><span class="hint">${note}</span></div>`;
  const check = (ok: boolean, text: string): string => `<div class="check"><span class="tick ${ok ? 'ok' : 'warn'}" aria-hidden="true">${ok ? '✓' : '!'}</span>${text}</div>`;

  const hist = S.submit.history.map((h) => `<tr><td><b>${esc(h.kind)}</b></td><td>${new Date(h.sent_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
    <td>${fmt(h.row_count)}</td><td>${esc(h.sent_by_name ?? '—')}</td><td>${h.feedback ? esc(h.feedback) : '<span class="hint">—</span>'}</td></tr>`).join('');

  return `${pageHead('Submissions and export', 'Build the Wednesday AM and Friday 5 PM updates to MPH from QA-approved items only.')}
    <div class="sub-grid"><section class="panel"><div class="rv-head"><h2>Next submission: ${slot.label}</h2><span class="chip pqa">${inText(slot.at)}</span></div>
      <div class="minis">${box('Ready to send', fmt(ready), 'Approved or mapped')}${box('Held back', fmt(held), 'Waiting for MPH validation')}${box('Waiting for QA', fmt(by['Pending QA'] ?? 0), 'Not in the file yet')}</div>
      <span class="label">Before sending</span>
      ${check((by['Pending QA'] ?? 0) === 0, (by['Pending QA'] ?? 0) === 0 ? 'No item is still waiting for QA' : `${fmt(by['Pending QA'] ?? 0)} items are still waiting for QA and are not included`)}
      ${check(held === 0, held === 0 ? 'Nothing is waiting for MPH validation' : `${fmt(held)} rows are waiting for MPH validation and are held back`)}
      ${check(ready > 0, ready > 0 ? `${fmt(ready)} rows are approved and ready` : 'Nothing is approved yet, so there is nothing to send')}
      <label class="f" for="exkind">What to export</label>
      <select id="exkind">${KINDS.map((k) => `<option value="${k.id}"${S.submit.kind === k.id ? ' selected' : ''}>${k.name}: ${k.desc}</option>`).join('')}</select>
      <div class="btns"><button class="btn primary" id="doexp"${S.submit.busy ? ' disabled' : ''}>${S.submit.busy ? 'Preparing…' : 'Download CSV'}</button>
        ${qa ? `<button class="btn" id="marksent"${ready ? '' : ' disabled'}>Mark as submitted</button>` : ''}</div>
      ${qa ? '' : banner('info', 'Only a QA reviewer can mark a submission as sent.')}</section>
      <aside class="panel note-card"><span class="label">Audit trail</span>
        <p>Every status change is logged with who made it and when. Marking a submission records how many rows went out and who sent them.</p></aside></div>
    <section class="panel flush tablewrap"><div class="panel-head"><h2>Submission history</h2></div>
      <table><thead><tr><th>Submission</th><th>Sent</th><th>Rows</th><th>By</th><th>MPH feedback</th></tr></thead>
      <tbody>${S.submit.loading && !hist ? skTableRows(5) : hist || '<tr><td colspan="5" class="hint">Nothing has been submitted yet.</td></tr>'}</tbody></table></section>`;
}
