import { isHttp } from '../components/aiTable';
import { skCards } from '../components/skeleton';
import { banner, pageHead, pill } from '../components/status';
import { ATTR_COLS } from '../rules/columns';
import { esc } from '../lib/dom';
import { PAGE_SIZE, S } from '../state';
import type { Item } from '../types';

const fmt = (n: number): string => n.toLocaleString('en-US');
const TABS: [string, string][] = [['Pending QA', 'Pending'], ['FOR MPH VALIDATION', 'Waiting for MPH approval'], ['Returned', 'Returned'], ['Approved', 'Approved']];

function kind(it: Item): string {
  if (it.status === 'FOR MPH VALIDATION') return 'New subtype';
  if (it.item_id.startsWith('REQ-')) return it.mph_code && !it.new_short ? 'Mapped to existing code' : 'New item';
  return it.new_short ? 'Reclassify' : 'Review';
}

/** The values the AI filled, each with its source and quote, so QA only has to confirm they are right. */
function check(it: Item): string {
  const pd = it.pasia_data;
  const proof = (pd?.AI_PROOF ?? null) as Record<string, { source?: string; url?: string; quote?: string }> | null;
  if (!pd || !proof) return '';
  const rows = ATTR_COLS.filter((c) => typeof pd[c.key] === 'string' && pd[c.key]).map((c) => {
    const p = proof[c.key];
    const src = p?.url && isHttp(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.source || p.url)}</a>` : esc(p?.source ?? '');
    return `<tr><td>${esc(c.label)}</td><td><b>${esc(String(pd[c.key]))}</b></td><td>${src}</td><td class="hint">${esc(p?.quote ?? '')}</td></tr>`;
  }).join('');
  return rows ? `<details class="qa-check"><summary class="hint">Check what the AI filled</summary>
    <div class="tablewrap"><table><thead><tr><th>Column</th><th>Value</th><th>Source</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : '';
}

function card(it: Item, qa: boolean): string {
  const dec = S.decided[it.item_id];
  const id = esc(it.item_id);
  let actions = '<span class="hint">Waiting for a QA reviewer</span>';
  if (qa && dec) {
    actions = `<span class="decided ${dec === 'Approved' ? 'tone-ok' : 'tone-no'}">${dec === 'Approved' ? 'Approved' : 'Returned to Production'}</span>
      <button class="btn" data-undo="${id}">Undo</button>`;
  } else if (qa && it.status === 'Pending QA') {
    actions = `<button class="btn primary" data-qa="${id}" data-a="Approved">Approve</button><button class="btn ret" data-qa="${id}" data-a="Returned">Return</button>`;
  } else if (it.status === 'Approved' || it.status === 'Returned') {
    actions = `<span class="decided ${it.status === 'Approved' ? 'tone-ok' : 'tone-no'}">${it.status}</span>`;
  }
  return `<div class="qa-card${dec ? (dec === 'Approved' ? ' is-ok' : ' is-no') : ''}">
    <div class="qa-main">
      <div class="qa-top"><span class="code">${id}</span><span class="chip cat">${kind(it)}</span>
        <span class="chip ${it.remarks ? 'pqa' : 'app'}">${it.remarks ? 'Has remarks' : 'No remarks'}</span></div>
      <div class="hint">Hospital: ${esc(it.hospital_name ?? '')} · ${esc(it.hospital_desc ?? '')}</div>
      <div class="qa-result">${esc(it.new_short ?? it.mph_short ?? 'No change proposed')}</div>
      <div class="hint">${esc(it.category ?? '')}${it.remarks ? ` · ${esc(it.remarks)}` : ''}</div>
      ${check(it)}
    </div><div class="qa-actions">${actions}</div></div>`;
}

export function vQa(): string {
  const q = S.qa;
  const qa = S.role === 'qa';
  const by = S.stats?.by_status ?? {};
  const pages = Math.max(1, Math.ceil(q.total / PAGE_SIZE));
  const box = (label: string, value: number, tone = ''): string => `<div class="stat"><span class="label">${label}</span><b class="${tone}">${fmt(value)}</b></div>`;
  const note = qa ? '' : banner('info', 'You can see what is waiting, but only a QA reviewer can approve or return items.');

  return `${pageHead('QA approval', 'Approve or return what Production submitted. Every decision is logged with who and when.')}
    <div class="stats">${box('Pending', by['Pending QA'] ?? 0)}${box('Approved', by.Approved ?? 0, 'tone-ok')}${box('Returned', by.Returned ?? 0, 'tone-no')}
      <div class="stat note"><span class="label">How it works</span><span>Approve sends the item on. Return sends it back to Production. Undo is available until you leave this page.</span></div></div>
    ${note}
    <div class="pills">${TABS.map(([s, l]) => pill(l, q.status === s, `data-list="qa" data-pill="${s}"`, by[s] ?? 0)).join('')}</div>
    <section class="panel flush">${q.loading ? skCards() : q.rows.length ? q.rows.map((it) => card(it, qa)).join('') : '<p class="hint pad">Nothing here. All clear.</p>'}
      <div class="panel-foot"><span class="hint">${fmt(q.total)} items · page ${q.page} of ${fmt(pages)}</span><span class="btns">
        <button class="btn sm" data-list="qa" data-page="-1"${q.page <= 1 ? ' disabled' : ''}>Previous</button>
        <button class="btn sm" data-list="qa" data-page="1"${q.page >= pages ? ' disabled' : ''}>Next</button></span></div></section>`;
}
