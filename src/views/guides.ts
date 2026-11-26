import { ATTRS } from '../data/attributes';
import { CATEGORY_MAP, SHORT_LIMIT } from '../data/guides';
import { esc } from '../lib/dom';
import { pageHead } from '../components/status';
import { S } from '../state';

const TABS = ['Attributes', 'Category Map'];

function attributes(): string {
  const rows = ATTRS.map((a, i) => `<tr><td>${i + 1}</td><td><b>${esc(a.col)}</b></td><td>${esc(a.group)}</td>
    <td>${a.required ? 'Required' : 'Optional'}</td><td>${a.options ? esc(a.options.join(', ')) : esc(a.hint ?? '') || '<span class="hint">Free text</span>'}</td></tr>`).join('');
  return `<div class="gd"><section class="gd-main">
    <div class="panel flush tablewrap"><div class="panel-head"><h2>Attributes and sequencing</h2>
      <p class="hint">${ATTRS.length} attributes: the pink columns of the working Excel. The same ones apply to every category.</p></div>
      <table><thead><tr><th>#</th><th>Attribute</th><th>Group</th><th>Use</th><th>Choices or example</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <aside class="gd-side"><div class="panel"><h2>Rules and sample</h2>
      <ul class="rules"><li>Join the parts with <code>;</code> in the order of the columns, starting with <code>NOUN;TYPE</code>.</li>
        <li>Write everything in capitals.</li>
        <li>The short description is at most ${SHORT_LIMIT} characters.</li>
        <li>Fill only the attributes that apply to the item.</li></ul>
      <span class="label">Sample short description</span><code>DIALYZER;HD/HDF;DIACAP</code>
      <span class="label">Sample long description</span><code>DIALYZER;HD/HDF;TREATMENT PACKAGE;STANDARD HD/HDF;DIACAP;B. BRAUN</code></div></aside></div>`;
}

function categoryMap(): string {
  const rows = CATEGORY_MAP.map((e) => `<tr><td><b>${esc(e.nt)}</b></td><td>${esc(e.cat)}</td><td>${esc(e.unspsc)}</td>
    <td>${e.terms.map((t) => `<span class="chip cat">${esc(t.toLowerCase())}</span>`).join(' ')}</td></tr>`).join('');
  return `<div class="panel flush tablewrap"><div class="panel-head"><h2>Category Map</h2>
    <p class="hint">When a hospital description contains one of these words, the portal suggests the Noun, Type, category and UNSPSC on the left.</p></div>
    <table><thead><tr><th>Noun;Type</th><th>Category</th><th>UNSPSC</th><th>Hospital wording</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function vGuides(): string {
  const active = TABS.includes(S.guideTab) ? S.guideTab : 'Attributes';
  return `${pageHead('Attribute guides', 'The attributes, rules and wording the New item form uses.')}
    <div class="tabs" role="tablist">${TABS.map((t) => `<button class="tab${t === active ? ' on' : ''}" role="tab" aria-selected="${t === active}" data-gtab="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div class="tabbody">${active === 'Category Map' ? categoryMap() : attributes()}</div>`;
}
