import { aiOutHtml, aiTableHtml, isHttp } from '../components/aiTable';
import { skCards } from '../components/skeleton';
import { pageHead } from '../components/status';
import { esc } from '../lib/dom';
import { CATEGORIES, categoryById } from '../rules';
import { ATTR_COLS } from '../rules/columns';
import { S } from '../state';
import type { UnspscRow } from '../types';

/** Result block, redrawn on every keystroke without touching the inputs. */
export const labOutHtml = (): string => aiOutHtml(S.lab.cat, S.lab.raw);

const label = (key: string): string => ATTR_COLS.find((c) => c.key === key)?.label ?? key;
const host = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Pages Firecrawl found, shown like a search results page. */
function results(): string {
  const r = S.lab.web.result;
  if (!r) return '';
  if (!r.results.length) return '<p class="hint">No page was found for this item. Try a shorter description, or paste a link below.</p>';
  return `<ol class="gres">${r.results.map((x) => {
    const site = x.site || host(x.url);
    const conf = x.product_page === false ? ' <span class="chip lo">Article, not used as proof</span>' : x.confidence ? ` <span class="chip ${x.confidence === 'High' ? 'app' : x.confidence === 'Medium' ? 'pqa' : 'rej'}">${x.confidence} match</span>` : '';
    return `<li><span class="gsite">${esc(site)}${conf}</span>
      <a class="gtitle" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || site)}</a>
      ${x.snippet ? `<p class="gsnip">${esc(x.snippet)}</p>` : ''}</li>`;
  }).join('')}</ol>`;
}

/** Every value found, grouped by column. Click one to use it; its proof links sit under it. */
function suggestions(): string {
  const r = S.lab.web.result;
  if (!r) return '';
  const items = r.items.filter((i) => i.column !== 'UNSPSC'); // shown in the UNSPSC panel instead
  if (!items.length) return '<p class="hint">No attribute could be proven from a page. Fill them in by hand in the table below.</p>';
  const cols = [...new Set(items.map((i) => i.column))].sort((a, b) => ATTR_COLS.findIndex((c) => c.key === a) - ATTR_COLS.findIndex((c) => c.key === b));
  return `<div class="sugs">${cols.map((col) => {
    const opts = items.filter((i) => i.column === col);
    const cur = (S.lab.raw[col] ?? '').trim().toUpperCase();
    return `<div class="sug"><span class="label">${esc(label(col))}</span><div class="sug-opts">${opts.map((o, i) => {
      const on = o.value.trim().toUpperCase() === cur;
      const links = o.sources.filter((s) => isHttp(s.url)).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.site || host(s.url))}</a>`).join(' · ');
      return `<div class="sug-opt"><button class="schip${on ? ' on' : ''}" data-labpick="${esc(col)}" data-idx="${i}" aria-pressed="${on}" title="${esc(o.quote)}">${on ? '✓ ' : ''}${esc(o.value)}</button>
        <span class="hint">${links}</span></div>`;
    }).join('')}</div></div>`;
  }).join('')}</div>`;
}

/** One official UNSPSC entry: code, title, where it sits in the tree, and its definition. */
function unspscRow(u: UnspscRow, extra = ''): string {
  const on = S.lab.unspsc.chosen === u.code;
  const path = [u.segment_title, u.family_title, u.class_title].filter(Boolean).map((x) => esc(x ?? '')).join(' › ');
  return `<div class="un-row${on ? ' on' : ''}"><div class="un-main">
      <span class="un-top"><b class="un-code">${esc(u.code)}</b> <b>${esc(u.title)}</b>${extra}</span>
      <span class="hint">${path}</span>
      ${u.definition ? `<span class="un-def">${esc(u.definition)}</span>` : ''}</div>
    <button class="btn sm${on ? ' primary' : ''}" data-unspsc="${esc(u.code)}" aria-pressed="${on}">${on ? '✓ Chosen' : 'Use'}</button></div>`;
}

/** Codes the pages printed, checked against the official list, then the best matches from the list itself. */
function unspscPanel(): string {
  const u = S.lab.unspsc;
  if (u.phase === 'idle') return '';
  if (u.phase === 'loading') return `<section class="panel"><h2>UNSPSC</h2>${skCards(2)}</section>`;
  const links = (s: { url: string; site: string }[]): string => s.filter((x) => isHttp(x.url))
    .map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.site || host(x.url))}</a>`).join(' · ');
  const waiting = S.lab.web.phase === 'loading';
  const inMatches = (code: string): boolean => u.matches.some((m) => m.code === code);
  const web = waiting
    ? '<p class="hint" role="status">Waiting for Firecrawl to read the pages…</p>'
    : u.web.length
    ? u.web.map((w) => w.row
      ? unspscRow(w.row, ` <span class="chip app">✓ In the official list</span>${inMatches(w.code)
        ? ' <span class="chip app">Agrees with the matches</span>'
        : ' <span class="chip pqa">Differs from the matches, check it</span>'}<br><span class="hint">Printed on ${links(w.sources)}: “${esc(w.quote)}”</span>`)
      : `<div class="un-row bad"><div class="un-main"><span class="un-top"><b class="un-code">${esc(w.code)}</b> <span class="chip rej">✗ Not in the official UNSPSC list</span></span>
          <span class="hint">Printed on ${links(w.sources)}: “${esc(w.quote)}”. Do not use it; pick from the matches below.</span></div></div>`).join('')
    : '<p class="hint">No page printed a UNSPSC code for this item.</p>';
  const VIA = { both: '<span class="chip app">Description + web</span>', web: '<span class="chip map">Web product name</span>', description: '<span class="chip lo">Description</span>' };
  const onWeb = (code: string): string => u.web.some((w) => w.row && w.code === code) ? ' <span class="chip app">✓ Also printed on a page</span>' : '';
  const matches = u.matches.length ? u.matches.map((m) => unspscRow(m, ` ${VIA[m.via]}${onWeb(m.code)}`)).join('')
    : '<p class="hint">No commodity in the official list matches these words. Try the noun alone, e.g. CANNULA.</p>';
  const basis = waiting
    ? '<p class="hint" role="status">From the hospital description for now. They are searched again with the product name once Firecrawl finds it.</p>'
    : u.product ? `<p class="hint">Searched with the description and the product name from the web: <b>${esc(u.product)}</b></p>`
    : '<p class="hint">From the hospital description only: the web found no product name.</p>';
  return `<section class="panel"><h2>UNSPSC <span class="hint">official list (UNDP)</span></h2>
    ${u.error ? `<div class="banner bad">${esc(u.error)}</div>` : ''}
    <span class="label">Best matches in the official list</span>${basis}${matches}
    <span class="label">Codes found on the web</span>${web}</section>`;
}

/** The chosen code, shown with the descriptions. */
function chosenUnspsc(): string {
  const u = S.lab.unspsc;
  if (!u.chosen) return '';
  const row = u.web.find((w) => w.code === u.chosen)?.row ?? u.matches.find((m) => m.code === u.chosen);
  return `<span class="label">UNSPSC commodity</span><p class="un-chosen"><b class="un-code">${esc(u.chosen)}</b> ${esc(row?.title ?? '')}</p>`;
}

export function vLab(): string {
  const cfg = categoryById(S.lab.cat);
  const w = S.lab.web;
  const loading = w.phase === 'loading';
  const r = w.result;
  const found = loading || r
    ? `<div class="grid2 gap lab-found">
        <section class="panel"><h2>Results${r ? ` <span class="hint">${r.results.length}</span>` : ''}</h2>
          ${r?.product ? `<p class="webprod">Most likely: <b>${esc(r.product)}</b></p>` : ''}${loading ? skCards(3) : results()}</section>
        <section class="panel"><h2>Suggested attributes</h2>
          <p class="hint">Click a value to use it. Hover it to see the quote from the page. Always open the source before you trust it.</p>
          ${loading ? skCards(3) : suggestions()}</section>
      </div>` : '';

  return `${pageHead('Rules Lab', 'Search the web (Firecrawl) for a hospital item and pick each attribute from what the pages say. Nothing here is saved.')}
    <section class="panel lab-search">
      <form class="lab-bar" id="labform">
        <div><label class="f" for="labcat">Category</label>
          <select id="labcat">${CATEGORIES.map((c) => `<option value="${esc(c.id)}"${c.id === cfg.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        <div class="grow"><label class="f" for="labh">Hospital item description</label>
          <input type="search" id="labh" placeholder="e.g. OXYGEN CANULA (INFANT)" value="${esc(S.lab.hospital)}" autocomplete="off"></div>
        <div class="btns"><button type="submit" class="btn primary"${loading ? ' disabled' : ''}>${loading ? 'Searching…' : 'Search the web'}</button>
          <button type="button" class="btn" data-labclear>Clear</button></div>
      </form>
      <details><summary class="hint">Add a page link myself</summary>
        <textarea id="labu" rows="2" placeholder="https://… one per line">${esc(S.lab.urls)}</textarea></details>
      ${S.lab.status ? `<div class="banner info">${esc(S.lab.status)}</div>` : ''}
      ${loading ? '<p class="hint" role="status">Firecrawl is searching and reading the pages. This can take up to a minute.</p>' : ''}
    </section>
    ${found}
    ${unspscPanel()}
    <div class="lab-work">
      <section class="panel flush lab-table"><div class="panel-head"><h2>Attributes</h2>
        <p class="hint">Filled from the rules and the web. Type to change any value; the source column shows where it came from.</p></div>
        ${aiTableHtml(S.lab.raw, S.lab.proofs, 'lab')}</section>
      <aside class="panel lab-result"><h2>Result</h2>${chosenUnspsc()}<div id="lab-out">${labOutHtml()}</div></aside>
    </div>`;
}
