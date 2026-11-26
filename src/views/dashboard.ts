import { skDash } from '../components/skeleton';
import { chip, pageHead } from '../components/status';
import { esc } from '../lib/dom';
import { inText, nextSlot } from '../lib/schedule';
import { S } from '../state';
import type { Analytics } from '../types';

const fmt = (n: number): string => n.toLocaleString('en-US');
const pct = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0);
/** Like pct, but never shows 0% for a non-zero count. */
const pctText = (n: number, total: number): string => (n > 0 && pct(n, total) === 0 ? '<1%' : `${pct(n, total)}%`);
/** Width for a bar segment: never invisible when the count is above zero. */
const wide = (n: number, total: number): number => (n ? Math.max((n / Math.max(total, 1)) * 100, 0.6) : 0);

/** Statuses in workflow order, each with the colour class used by the stacked bars and legends. */
const FLOW: { status: string; cls: string }[] = [
  { status: 'Ongoing Review', cls: 'st-rev' },
  { status: 'FOR MPH VALIDATION', cls: 'st-mph' },
  { status: 'FOR HOSPITAL TICKET', cls: 'st-tkt' },
  { status: 'Pending QA', cls: 'st-qa' },
  { status: 'Returned', cls: 'st-ret' },
  { status: 'Approved', cls: 'st-app' },
  { status: 'Mapped', cls: 'st-map' },
];

/** The four groups used to compare categories, priorities and hospitals at a glance. */
type Group = 'done' | 'qa' | 'ret' | 'open';
const GROUPS: { id: Group; label: string }[] = [
  { id: 'done', label: 'Approved / mapped' },
  { id: 'qa', label: 'Waiting for QA' },
  { id: 'ret', label: 'Returned' },
  { id: 'open', label: 'Still open' },
];
const groupOf = (status: string): Group =>
  status === 'Approved' || status === 'Mapped' ? 'done' : status === 'Pending QA' ? 'qa' : status === 'Returned' ? 'ret' : 'open';

interface Split { k: string; total: number; done: number; qa: number; ret: number; open: number }

function split(rows: { k: string; status: string; n: number }[], label: (k: string) => string): Split[] {
  const m = new Map<string, Split>();
  for (const r of rows) {
    const k = label(r.k);
    const s = m.get(k) ?? { k, total: 0, done: 0, qa: 0, ret: 0, open: 0 };
    s[groupOf(r.status)] += r.n;
    s.total += r.n;
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

const legend = (items: { cls: string; label: string; value?: string }[]): string =>
  `<ul class="legend">${items.map((i) => `<li><i class="sw ${i.cls}"></i>${esc(i.label)}${i.value ? ` <b>${i.value}</b>` : ''}</li>`).join('')}</ul>`;

/** Rows of: name, stacked bar (done / QA / returned / open, scaled to the largest row), total, % done. */
function splitRows(rows: Split[]): string {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const cls: Record<Group, string> = { done: 'st-app', qa: 'st-qa', ret: 'st-ret', open: 'st-open' };
  return `<div class="srows">${rows.map((r) => {
    const segs = GROUPS.map((g) => `<span class="${cls[g.id]}" style="width:${wide(r[g.id], max)}%" title="${esc(g.label)}: ${fmt(r[g.id])}"></span>`).join('');
    return `<div class="srow"><span class="srow-name" title="${esc(r.k)}">${esc(r.k)}</span>
      <div class="stack thin" role="img" aria-label="${esc(r.k)}: ${fmt(r.done)} done, ${fmt(r.qa)} waiting for QA, ${fmt(r.ret)} returned, ${fmt(r.open)} open">${segs}</div>
      <b>${fmt(r.total)}</b><span class="srow-pct">${pctText(r.done, r.total)}</span></div>`;
  }).join('')}</div>`;
}
const splitLegend = (): string => legend(GROUPS.map((g) => ({ cls: ({ done: 'st-app', qa: 'st-qa', ret: 'st-ret', open: 'st-open' } as const)[g.id], label: g.label })));

/** Approvals per day: a column chart in SVG, with the busiest day labelled. */
function dailyChart(daily: Analytics['daily']): string {
  const W = 640, H = 170, padL = 30, padB = 22, padT = 10;
  const max = Math.max(1, ...daily.map((d) => d.approved));
  const top = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const bw = (W - padL) / daily.length;
  const y = (v: number): number => padT + (H - padT - padB) * (1 - v / top);
  const grid = [0, top / 2, top].map((v) => `<line class="gl" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="gt" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const bars = daily.map((d, i) => {
    const h = (H - padT - padB) * (d.approved / top);
    return `<rect class="col" x="${padL + i * bw + 2}" y="${H - padB - h}" width="${Math.max(bw - 4, 2)}" height="${Math.max(h, d.approved ? 2 : 0)}" rx="2"><title>${esc(d.day)}: ${fmt(d.approved)} approved</title></rect>`;
  }).join('');
  const label = (i: number): string => {
    const d = daily[i];
    if (!d) return '';
    const t = new Date(`${d.day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const anchor = i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle';
    const x = i === 0 ? padL : i === daily.length - 1 ? W : padL + i * bw + bw / 2;
    return `<text class="gt" x="${x}" y="${H - 4}" text-anchor="${anchor}">${t}</text>`;
  };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Approvals per day, last ${daily.length} days" preserveAspectRatio="xMidYMid meet">${grid}${bars}${label(0)}${label(Math.floor(daily.length / 2))}${label(daily.length - 1)}</svg>`;
}

const sum = (daily: Analytics['daily'], from: number, to: number): number => daily.slice(from, to).reduce((a, d) => a + d.approved, 0);

export function vDash(): string {
  const slot = nextSlot();
  const head = pageHead('Dashboard', 'Where every item in the MPH working file stands, and how fast it is moving.',
    `<div class="nextbox"><span class="label">Next submission to MPH</span><b>${slot.label}</b> <span class="hint">· ${inText(slot.at)}</span></div>`);
  const s = S.stats;
  const feedback = S.statsError
    ? `<div class="banner bad" role="alert">${esc(S.statsError)}${s ? ' Showing the last loaded totals.' : ''} <button class="btn" id="retry-stats">Try again</button></div>`
    : '';
  if (!s) return `${head}${feedback || (S.statsLoading ? skDash() : '<button class="btn" id="retry-stats">Load dashboard</button>')}`;

  const by = s.by_status;
  const an = S.analytics;
  const approved = by.Approved ?? 0;
  const done = approved + (by.Mapped ?? 0);
  const waitingQa = by['Pending QA'] ?? 0;
  const needsAction = (by.Returned ?? 0) + (by['FOR HOSPITAL TICKET'] ?? 0);

  // --- Pace, from the audit log (portal approvals only; imported rows are not counted) ---
  const daily = an?.daily ?? [];
  const last7 = sum(daily, -7, daily.length);
  const prev7 = sum(daily, -14, -7);
  const avg = last7 / 7;
  const delta = last7 - prev7;
  const trend = !daily.length ? ''
    : prev7 === 0 && last7 === 0 ? 'No approvals in the last 14 days'
    : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${delta === 0 ? 'same as' : `${fmt(Math.abs(delta))} ${delta > 0 ? 'more' : 'fewer'} than`} the 7 days before`;
  const optimaLeft = Math.max(s.optima - s.optima_done, 0);
  const eta = avg > 0 && optimaLeft ? Math.ceil(optimaLeft / avg) : 0;
  const decided = (an?.qa_approved ?? 0) + (an?.qa_returned ?? 0);

  const kpi = (value: string, label: string, note: string, bar?: number, tone = ''): string =>
    `<div class="kpi ${tone}"><span class="kpi-label">${label}</span><b>${value}</b>
     ${bar === undefined ? '' : `<div class="bar"><div class="hi" style="width:${Math.max(bar, bar ? 1 : 0)}%"></div></div>`}<span class="kpi-note">${note}</span></div>`;

  const kpis = `<div class="kpis">
    ${kpi(fmt(s.total), 'Items in the working file', `${fmt(waitingQa)} waiting for QA now`)}
    ${kpi(`${pctText(done, s.total)}`, 'Standardized', `${fmt(done)} approved or mapped of ${fmt(s.total)}`, pct(done, s.total))}
    ${an ? kpi(fmt(last7), 'Approved, last 7 days', `${avg >= 0.1 ? `${avg.toFixed(1)}/day · ` : ''}${trend}`) : kpi(fmt(approved), 'Approved', `${pctText(approved, s.total)} of all items`, pct(approved, s.total))}
    ${kpi(`${fmt(s.optima_done)} <small>of ${fmt(s.optima)}</small>`, 'OPTIMA priority done', eta ? `${fmt(optimaLeft)} left · about ${fmt(eta)} day${eta === 1 ? '' : 's'} at the 7-day pace` : `${pctText(s.optima_done, s.optima)} approved`, pct(s.optima_done, s.optima))}
  </div>`;

  // --- Pipeline: every status in workflow order as one bar ---
  const flowRows = FLOW.map((f) => ({ ...f, n: by[f.status] ?? 0 }));
  const known = new Set(FLOW.map((f) => f.status));
  const other = Object.entries(by).filter(([k]) => !known.has(k)).reduce((a, [, n]) => a + n, 0);
  if (other) flowRows.push({ status: 'Other', cls: 'st-open', n: other });
  const pipeline = `<section class="panel">
    <div class="ph"><h2>Pipeline</h2><span class="hint">${fmt(needsAction)} need action (returned or waiting on a hospital ticket)</span></div>
    <div class="stack" role="img" aria-label="Items by status">${flowRows.map((r) => `<span class="${r.cls}" style="width:${wide(r.n, s.total)}%" title="${esc(r.status)}: ${fmt(r.n)}"></span>`).join('')}</div>
    <div class="flow">${flowRows.map((r) => `<div class="flow-i"><span class="flow-h"><i class="sw ${r.cls}"></i>${chip(r.status)}</span><b>${fmt(r.n)}</b><span class="hint">${pctText(r.n, s.total)}</span></div>`).join('')}</div>
  </section>`;

  // --- Trend + QA quality ---
  const trendPanel = an
    ? `<section class="panel">
        <div class="ph"><h2>Approvals per day</h2><span class="hint">Last ${daily.length} days · counted from portal activity</span></div>
        ${dailyChart(daily)}
        <div class="mini-stats">
          <div><span class="label">Last 30 days</span><b>${fmt(sum(daily, 0, daily.length))}</b><span class="hint">approvals</span></div>
          <div><span class="label">QA first-pass</span><b>${decided ? `${pct(an.qa_approved, decided)}%` : '—'}</b><span class="hint">${decided ? `${fmt(an.qa_approved)} approved · ${fmt(an.qa_returned)} returned` : 'no QA decisions yet'}</span></div>
          <div><span class="label">Status changes</span><b>${fmt(daily.reduce((a, d) => a + d.changes, 0))}</b><span class="hint">last 30 days</span></div>
        </div>
      </section>`
    : `<section class="panel"><div class="ph"><h2>Approvals per day</h2></div>
        <p class="hint pad0">${S.analyticsLoading ? 'Loading trends…' : 'Trends are not available yet. Run <b>supabase/dashboard-analytics.sql</b> once in the Supabase SQL Editor to turn them on.'}</p></section>`;

  const catRows = Object.entries(s.by_category).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const catPanel = an
    ? `<section class="panel">
        <div class="ph"><h2>Progress by category</h2><span class="hint">Top 10 by size · % is approved or mapped</span></div>
        ${splitLegend()}${splitRows(split(an.category_status, (k) => k).slice(0, 10))}
      </section>`
    : `<section class="panel"><h2>Top 10 categories</h2><div class="bars">${catRows.map(([k, n]) => `<div class="b"><span>${esc(k)}</span><div class="track"><div class="fill blue" style="width:${Math.max(pct(n, catRows[0]?.[1] ?? 1), 1)}%"></div></div><b>${fmt(n)}</b></div>`).join('')}</div></section>`;

  const hosp = S.hospitalStats;
  const hospPanel = hosp
    ? `<section class="panel">
        <div class="ph"><h2>Hospitals</h2><span class="hint">Top ${hosp.length} by items · where the work is, and where it is stuck</span></div>
        <div class="srows">${(() => {
          const max = Math.max(1, ...hosp.map((h) => h.total));
          return hosp.map((h) => {
            const rest = Math.max(h.total - h.approved - h.open, 0);
            return `<div class="srow"><span class="srow-name" title="${esc(h.k)}">${esc(h.k)}</span>
              <div class="stack thin" role="img" aria-label="${esc(h.k)}: ${fmt(h.approved)} done, ${fmt(h.open)} need action, ${fmt(rest)} in progress">
                <span class="st-app" style="width:${wide(h.approved, max)}%" title="Approved / mapped: ${fmt(h.approved)}"></span>
                <span class="st-ret" style="width:${wide(h.open, max)}%" title="Returned or waiting on ticket: ${fmt(h.open)}"></span>
                <span class="st-open" style="width:${wide(rest, max)}%" title="In progress: ${fmt(rest)}"></span></div>
              <b>${fmt(h.total)}</b><span class="srow-pct">${pctText(h.approved, h.total)}</span></div>`;
          }).join('');
        })()}</div>
        ${legend([{ cls: 'st-app', label: 'Approved / mapped' }, { cls: 'st-ret', label: 'Returned / hospital ticket' }, { cls: 'st-open', label: 'In progress' }])}
      </section>`
    : '';

  const prio = an ? split(an.priority_status, (k) => k || 'No priority').sort((a, b) => (a.k === 'OPTIMA' ? -1 : b.k === 'OPTIMA' ? 1 : b.total - a.total)).slice(0, 8) : [];
  const prioPanel = an && prio.length
    ? `<section class="panel">
        <div class="ph"><h2>By priority</h2><span class="hint">OPTIMA first</span></div>
        ${splitLegend()}${splitRows(prio)}
      </section>`
    : '';

  return `${head}${feedback}${kpis}${pipeline}
    <div class="grid2 gap">${trendPanel}${catPanel}</div>
    ${hospPanel || prioPanel ? `<div class="grid2 gap">${hospPanel}${prioPanel}</div>` : ''}`;
}
