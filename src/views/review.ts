import { aiBlocked, aiOutHtml, aiTableHtml } from '../components/aiTable';
import { skDetail, skRows } from '../components/skeleton';
import { banner, chip, pageHead, pill } from '../components/status';
import { esc } from '../lib/dom';
import { PAGE_SIZE, S } from '../state';
import type { ItemDetail } from '../types';

const fmt = (n: number): string => n.toLocaleString('en-US');
const FILTERS = ['Ongoing Review', 'FOR MPH VALIDATION', 'FOR HOSPITAL TICKET', 'Returned', 'Mapped'] as const;

/** First http(s) link found in the source columns of the sheet. */
function sourceLink(d: ItemDetail): string | null {
  const all: Record<string, unknown> = { ...d.mph_data, ...d.pasia_data };
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('FILE NAME/FILE LINK') && typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

/** Fill every column with AI (description + the team's Excel rules + the web), then send it to QA with the sources. */
function aiPanel(d: ItemDetail): string {
  if (['Pending QA', 'Approved', 'Mapped'].includes(d.status ?? '')) return '';
  const ai = S.review.ai;
  const mine = ai.id === d.item_id;
  const loading = mine && ai.phase === 'loading';
  const done = mine && ai.phase === 'done';
  const head = `<div class="ai-head"><div><span class="label">AI fill</span>
      <span class="hint">Fills every column from the hospital description, the team's Excel rules and the web, with the source of each. QA then checks it.</span></div>
    <button class="btn primary" data-aifill="${esc(d.item_id)}"${loading ? ' disabled' : ''}>${loading ? 'Filling…' : done ? 'Fill again' : 'Fill with AI'}</button></div>`;
  if (!done) return `<div class="box ai">${head}</div>`;
  const cat = d.category ?? '';
  const blocked = aiBlocked(cat, ai.raw);
  return `<div class="box ai">${head}<div class="banner info">${esc(ai.status)}</div>
    <div id="rai-out">${aiOutHtml(cat, ai.raw)}</div>
    ${aiTableHtml(ai.raw, ai.proofs, 'rai')}
    <div class="actions"><button class="btn primary" data-aisend="${esc(d.item_id)}">Send to QA</button>
      <span class="hint">${blocked.length ? esc(`Fix first: ${blocked[0]}`) : 'QA will see every value with its source.'}</span></div></div>`;
}

function detail(d: ItemDetail): string {
  const p = d.pasia_data;
  const newCommodity = typeof p.COMMODITY === 'string' ? p.COMMODITY : null;
  const link = sourceLink(d);
  const canAccept = !!d.new_short && d.status !== 'Pending QA' && d.status !== 'Approved';
  const card = (label: string, value: string): string => `<div class="mini"><span class="label">${label}</span><b>${value}</b></div>`;

  return `<div class="rv-head"><h2>${esc(d.item_id)}</h2>${chip(d.status)}
      <span class="hint">${esc(d.category ?? '')} · ${esc(d.hospital_name ?? '')}</span></div>
    ${d.status === 'Mapped' ? banner('good', `This hospital description was mapped to the existing MPH code <b>${esc(d.mph_code ?? '')}</b>. No new item was created and nothing goes to QA.`) : ''}
    <div class="grid2 cmp">
      <div class="box"><span class="label">As found in the master</span>
        <div class="big">${esc(d.hospital_desc ?? '—')}</div>
        <div class="hint">MPH short: ${esc(d.mph_short ?? '—')}</div>
        <div class="hint">Filed as: ${esc(d.category ?? '—')} · UNSPSC ${esc(d.unspsc_commodity ?? '—')}</div></div>
      <div class="box ${d.new_short ? 'proposed' : ''}"><span class="label">${d.new_short ? 'Proposed' : 'No proposal yet'}</span>
        ${d.new_short
          ? `<div class="big">${esc(d.new_short)}</div><div class="hint">${esc(d.new_long ?? '')}</div><div class="hint">UNSPSC ${esc(newCommodity ?? 'no change')}</div>`
          : '<div class="hint">Nobody has proposed new wording for this row. Build one under New item, or raise a hospital ticket.</div>'}</div>
    </div>
    ${aiPanel(d)}
    <span class="label">Review remarks</span>
    <p class="remarks">${d.remarks ? esc(d.remarks) : '<span class="hint">No remarks.</span>'}</p>
    <div class="minis">${card('Hospital', esc(`${d.hospital_name ?? '—'}${d.hospital_code ? ` · ${d.hospital_code}` : ''}`))}
      ${card('Supplier', esc(d.supplier ?? '—'))}${card('Source check', link ? 'Link found' : 'No link in the file')}
      ${card('Priority', esc(d.priority ?? 'Normal'))}</div>
    <div class="actions">
      <button class="btn primary" data-act="accept" data-id="${esc(d.item_id)}"${canAccept ? '' : ' disabled'}>Accept proposal</button>
      <button class="btn" data-act="mph" data-id="${esc(d.item_id)}"${d.status === 'FOR MPH VALIDATION' ? ' disabled' : ''}>Send to MPH validation</button>
      <button class="btn" data-act="ticket" data-id="${esc(d.item_id)}"${d.status === 'FOR HOSPITAL TICKET' ? ' disabled' : ''}>Raise hospital ticket</button>
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open source link</a>` : ''}
      <span class="hint push">${canAccept ? 'Goes to the QA queue after you accept' : d.new_short ? 'Already with QA' : 'Add a proposal to send it to QA'}</span></div>`;
}

export function vReview(): string {
  const r = S.review;
  const by = S.stats?.by_status ?? {};
  const pages = Math.max(1, Math.ceil(r.total / PAGE_SIZE));
  const total = S.stats?.total;

  const rows = r.rows.map((it) => `<button class="rowbtn${it.item_id === r.selected ? ' sel' : ''}" data-pick="${esc(it.item_id)}">
      <span class="rowtop"><b>${esc(it.item_id)}</b>${chip(it.status)}</span>
      <span class="rowdesc">${esc(it.hospital_desc ?? '')}</span>
      <span class="hint">${esc(it.category ?? '')} · ${esc(it.hospital_name ?? '')}</span></button>`).join('');

  const pills = [pill('All', r.status === '', 'data-list="review" data-pill=""', total),
    ...FILTERS.map((f) => pill(f, r.status === f, `data-list="review" data-pill="${f}"`, by[f] ?? 0))].join('');

  const right = detailPane();
  function detailPane(): string {
    if (r.detailLoading || (r.loading && !r.detail)) return skDetail();
    if (!r.detail) return r.rows.length ? '<p class="hint">Pick a row on the left.</p>' : '';
    return detail(r.detail);
  }

  const empty = !r.loading && !r.rows.length ? banner('info', 'No rows match this filter.') : '';
  return `${pageHead('Review existing rows', `${r.total ? fmt(r.total) : 'No'} rows in this view. Click a row to review the proposal.`)}
    <div class="pills">${pills}</div>
    ${empty}
    <div class="rv"><section class="panel flush rv-list">
      <div class="rv-search"><label class="f sr" for="rsearch">Search</label>
        <input type="text" id="rsearch" data-list="review" placeholder="Search ID or description, press Enter" value="${esc(r.q)}"></div>
      <div class="rv-rows">${r.loading ? skRows() : rows}</div>
      <div class="panel-foot"><span class="hint">Page ${r.page} of ${fmt(pages)}</span><span class="btns">
        <button class="btn sm" data-list="review" data-page="-1"${r.page <= 1 ? ' disabled' : ''}>Previous</button>
        <button class="btn sm" data-list="review" data-page="1"${r.page >= pages ? ' disabled' : ''}>Next</button></span></div></section>
      <section class="panel rv-detail">${right}</section></div>`;
}
