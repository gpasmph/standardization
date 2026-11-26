import { ATTRS, GROUPS } from '../data/attributes';
import { SHORT_LIMIT } from '../data/guides';
import { SAMPLES } from '../data/master';
import { esc } from '../lib/dom';
import { icon } from '../components/icons';
import { pageHead } from '../components/status';
import { S } from '../state';

const STEPS = ['Describe', 'Match', 'Classify', 'Attributes', 'Check and submit'];

function stepper(): string {
  const current = S.step;
  return `<ol class="steps" aria-label="Progress">${STEPS.map((l, i) => {
    const n = i + 1;
    const cls = n < current ? 'done' : n === current ? 'now' : '';
    return `<li class="${cls}"${n === current ? ' aria-current="step"' : ''}><span class="n">${n < current ? icon('check', 14) : n}</span>${l}</li>`;
  }).join('')}</ol>`;
}

function describe(): string {
  return `<section class="panel"><h2>What did the hospital request?</h2>
    <div class="grid2"><div><label class="f" for="hosp">Hospital</label>
      <select id="hosp">${S.hospitals.map((x) => `<option${x === S.input.h ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
    <label class="f" for="hdesc">Hospital item description <span class="req">*</span></label>
    <textarea id="hdesc" placeholder="Paste the description exactly as the hospital wrote it">${esc(S.input.t)}</textarea>
    <div class="samples"><span class="hint">Try a sample:</span>${SAMPLES.map((s, i) => `<button class="sample" data-sample="${i}">${esc(s.t)}</button>`).join('')}</div>
    <div class="btns"><button class="btn primary" id="go1">Find matches</button></div></section>`;
}

function matches(): string {
  const cards = S.matches.map((m, i) => {
    const tone = m.score >= 75 ? 'hi' : m.score >= 45 ? 'mid' : 'lo';
    const label = m.score >= 75 ? 'Strong match' : m.score >= 45 ? 'Possible match' : 'Weak match';
    return `<div class="match">
      <div class="match-main">
        <div class="match-top"><span class="code">${esc(m.code)}</span><span class="chip ${tone}">${label}</span><span class="chip cat">${esc(m.cat)}</span></div>
        <div class="match-short">${esc(m.short)}</div>
        <div class="why">${m.why.map((w) => `<span class="${w.ok ? 'ok' : 'no'}">${esc(w.text)}</span>`).join('')}</div>
      </div>
      <div class="sim"><b>${m.score}% similar</b><div class="bar"><div class="${tone}" style="width:${m.score}%"></div></div></div>
      <button class="btn${i === 0 && m.score >= 75 ? ' primary' : ''}" data-use="${i}">Use this code</button>
    </div>`;
  }).join('');

  return `<section class="panel flush"><div class="panel-head"><h2>Closest items in the MPH master</h2>
      <p class="hint">For: “${esc(S.input.t)}” (${esc(S.input.h)})</p></div>
    ${S.matches.length ? cards : '<div class="banner info">No close match in the master. Continue to classify it as a new item.</div>'}
    <div class="panel-foot"><span class="hint">Using an existing code maps the item to it. No new item is created and nothing goes to QA.</span>
      <span class="btns"><button class="btn" id="back">Back</button><button class="btn" id="nomatch">None of these – create new item</button></span></div></section>`;
}

function classifyStep(): string {
  const c = S.cls;
  if (!c) return '';
  const cats = Object.keys(S.stats?.by_category ?? {}).sort();
  if (c.category && !cats.includes(c.category)) cats.unshift(c.category);
  const info = c.why
    ? `<div class="banner good">${esc(c.why)}. Check it below.</div>`
    : '<div class="banner warnb">No suggestion for this description. Type the Noun and Type yourself.</div>';
  const catField = cats.length
    ? `<select id="c_cat"><option value="">Select</option>${cats.map((k) => `<option${k === c.category ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>`
    : `<input type="text" id="c_cat" value="${esc(c.category)}">`;
  return `<section class="panel"><h2>Classify the new item</h2>${info}
    <div class="grid2">
      <div><label class="f" for="c_noun">Noun <span class="req">*</span></label><input type="text" id="c_noun" value="${esc(c.noun)}" placeholder="e.g. CATHETER"></div>
      <div><label class="f" for="c_type">Type <span class="req">*</span></label><input type="text" id="c_type" value="${esc(c.type)}" placeholder="e.g. IV"></div>
      <div><label class="f" for="c_cat">MPH category <span class="req">*</span></label>${catField}</div>
      <div><label class="f" for="c_unspsc">UNSPSC commodity <span class="hint">8 digits</span></label><input type="text" id="c_unspsc" value="${esc(c.unspsc)}" inputmode="numeric" placeholder="e.g. 42221512"></div>
    </div>
    <div class="btns"><button class="btn" id="back">Back</button><button class="btn primary" id="go3">Continue to attributes</button></div></section>`;
}

/** Counter bar under the short description. Re-rendered alone while typing. */
export function meterHtml(): string {
  const n = S.desc.short.length;
  const over = n > SHORT_LIMIT;
  return `<div class="ruler${over ? ' over' : ''}" aria-hidden="true">${Array.from({ length: SHORT_LIMIT }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
    <div class="count${over ? ' over' : ''}">${n} of ${SHORT_LIMIT} characters${over ? ': shorten it' : ''}</div>`;
}

/** Live preview card: both descriptions are suggested from the attributes and can be edited. */
export function previewHtml(): string {
  return `<h2>Descriptions</h2>
    <label class="f" for="d_short">Short description <button class="linkbtn" data-resetdesc="short"${S.desc.eShort ? '' : ' hidden'}>Reset</button></label>
    <textarea id="d_short" class="desc-in" rows="2" data-desc="short" placeholder="Fills in as you type the attributes">${esc(S.desc.short)}</textarea>
    <div id="meter">${meterHtml()}</div>
    <label class="f" for="d_long">Long description <button class="linkbtn" data-resetdesc="long"${S.desc.eLong ? '' : ' hidden'}>Reset</button></label>
    <textarea id="d_long" class="desc-in" rows="4" data-desc="long">${esc(S.desc.long)}</textarea>
    <p class="hint">Parts are joined with “;” in the same order as the Excel columns. This is a suggestion: you can edit both.</p>`;
}

const applied = (col: string, value: string): boolean => (S.vals[col] ?? '').trim().toUpperCase() === value.trim().toUpperCase();

/** "Find proof on the web": suggestions come with the pages they were found on; nothing is filled until the analyst accepts. */
function webBox(): string {
  const w = S.web;
  const loading = w.phase === 'loading';
  const head = `<div class="webhead"><div><b>Find proof on the web</b>
      <span class="hint">Searches Google for the product page and returns only values that have a source link. The hospital description is sent to Google.</span></div>
    <button class="btn" id="weblookup"${loading ? ' disabled' : ''}>${loading ? 'Searching…' : w.result ? 'Search again' : 'Search the web'}</button></div>`;
  const r = w.result;
  if (loading) return `<div class="webbox">${head}<p class="hint">This can take up to a minute.</p></div>`;
  if (!r) return `<div class="webbox">${head}</div>`;
  if (!r.items.length) {
    return `<div class="webbox">${head}<div class="banner warnb">No attribute could be proven from a web page. Fill them in by hand, or add the source link below.</div></div>`;
  }
  const rows = r.items.map((it) => `<div class="webrow">
      <div class="webmain"><span class="label">${esc(it.column)}</span><b>${esc(it.value)}</b>
        ${it.quote ? `<span class="hint">“${esc(it.quote)}”</span>` : ''}
        <span class="hint">${it.sources.filter((s) => /^https?:\/\//i.test(s.url)).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.site || 'Source')}</a>`).join(' · ')}</span></div>
      <button class="btn sm${applied(it.column, it.value) ? '' : ' primary'}" data-webuse="${esc(it.column)}"${applied(it.column, it.value) ? ' disabled' : ''}>${applied(it.column, it.value) ? 'Used' : 'Use'}</button></div>`).join('');
  return `<div class="webbox">${head}
    ${r.product ? `<p class="webprod">Found: <b>${esc(r.product)}</b></p>` : ''}${rows}
    <div class="btns"><button class="btn sm" id="webuseall">Use all ${r.items.length}</button></div>
    <p class="hint">${r.skipped ? `${r.skipped} attribute(s) had no source link and were left out. ` : ''}Always check the source page before you accept a value.${r.queries.length ? ` Google searched: ${esc(r.queries.join('; '))}.` : ''}</p></div>`;
}

function attributes(): string {
  const groups = GROUPS.map((g) => {
    const fields = ATTRS.map((a, i) => ({ a, i })).filter(({ a }) => a.group === g).map(({ a, i }) => {
      const v = S.vals[a.col] ?? '';
      const label = `<label class="f" for="a_${i}">${esc(a.col)}${a.required ? ' <span class="req">*</span>' : ''}${a.hint ? ` <span class="hint">${esc(a.hint)}</span>` : ''}</label>`;
      const input = a.options
        ? `<select id="a_${i}" data-attr="${esc(a.col)}"><option value="">—</option>${a.options.map((o) => `<option${v === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input type="text" id="a_${i}" data-attr="${esc(a.col)}" value="${esc(v)}" autocomplete="off">`;
      const pr = S.proofs[a.col];
      const proof = pr && pr.value.toUpperCase() === v.trim().toUpperCase() && /^https?:\/\//i.test(pr.url)
        ? `<a class="proof" href="${esc(pr.url)}" target="_blank" rel="noopener noreferrer" title="${esc(pr.quote)}">Source: ${esc(pr.site || 'open page')}</a>` : '';
      return `<div>${label}${input}${proof}</div>`;
    }).join('');
    return `<fieldset class="attrgroup"><legend>${g}</legend><div class="grid3">${fields}</div></fieldset>`;
  }).join('');

  return `<div class="split"><section class="panel"><h2>Attributes for ${esc(S.cls?.noun ?? '')};${esc(S.cls?.type ?? '')}</h2>
    <p class="hint">The same columns as the PASIA TEAM section of the Excel. Fill only what applies. Values read from the hospital text are filled in for you to confirm.</p>
    ${webBox()}
    ${groups}
    <label class="f" for="src">Source link <span class="req">*</span> <span class="hint">supplier page, catalogue or brochure</span></label>
    <input type="url" id="src" placeholder="https://" value="${esc(S.src)}">
    <label class="f" for="att">Supporting documents <span class="hint">brochure, item picture (names only are saved for now)</span></label>
    <input type="file" id="att" multiple><div class="files">${S.files.map(esc).join(', ')}</div>
    <div class="btns"><button class="btn" id="back">Back</button><button class="btn primary" id="go4">Check for duplicates</button></div></section>
    <aside class="panel preview" aria-live="polite">${previewHtml()}</aside></div>`;
}

function review(): string {
  const c = S.cls;
  if (!c) return '';
  const dups = S.dups;
  const banner = S.chosen
    ? `<div class="banner info">You chose an existing code, so <b>no new MPH code is created</b>. Submitting sends this mapping to <b>${esc(S.chosen.code)}</b> to QA for approval.</div>`
    : dups.length
    ? `<div class="banner bad"><b>Possible duplicate.</b> ${dups.map((m) => `${esc(m.mph_code ?? 'proposal')} ${esc(m.mph_short ?? '')}`).join('; ')}. Use the existing code or confirm this item is different.</div>`
    : '<div class="banner good"><b>No duplicate found</b> with this exact short description.</div>';
  const filled = ATTRS.filter((a) => (S.vals[a.col] ?? '').trim());
  return `<section class="panel"><h2>Check and submit</h2>${banner}
    <dl class="kv"><dt>Hospital request</dt><dd>${esc(S.input.t)} (${esc(S.input.h)})</dd>
      ${S.chosen ? `<dt>Maps to MPH code</dt><dd>${esc(S.chosen.code)}</dd>` : ''}
      <dt>Category / UNSPSC</dt><dd>${esc(c.category)} / ${esc(c.unspsc || '—')}</dd>
      <dt>Noun;Type</dt><dd>${esc(c.noun)};${esc(c.type)}</dd>
      <dt>Short description</dt><dd>${esc(S.desc.short)}</dd>
      <dt>Long description</dt><dd>${esc(S.desc.long)}</dd>
      ${filled.map((a) => {
        const p = S.proofs[a.col];
        const link = p && applied(a.col, p.value) && /^https?:\/\//i.test(p.url) ? ` <a class="proof" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Source: ${esc(p.site || 'open page')}</a>` : '';
        return `<dt>${esc(a.col)}</dt><dd>${esc(S.vals[a.col] ?? '')}${link}</dd>`;
      }).join('')}
      <dt>Source</dt><dd>${esc(S.src)}</dd>
      <dt>Attachments</dt><dd>${S.files.length ? S.files.map(esc).join(', ') : 'None'}</dd></dl>
    <div class="btns"><button class="btn" id="back">Back</button><button class="btn primary" id="submit">Submit for QA</button></div></section>`;
}

export function vNew(): string {
  const body = { 1: describe, 2: matches, 3: classifyStep, 4: attributes, 5: review }[S.step]();
  return pageHead('New item', 'Start from the hospital’s description. The portal checks the master first, so no duplicate MPH code is created.') + stepper() + body;
}
