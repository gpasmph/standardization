import { saveProposal, fetchDuplicates, fetchExport, fetchItem, insertRequest, insertSubmission, setStatus, webLookup, labSearch, unspscGet, unspscSearch } from './api';
import { signIn, signOut } from './auth';
import { ATTRS, REQUIRED } from './data/attributes';
import { SHORT_LIMIT } from './data/guides';
import { SAMPLES } from './data/master';
import { prefillFromText, syncDesc } from './lib/describe';
import { $, toast } from './lib/dom';
import { importRows, parseExcel } from './lib/importer';
import { classify, findMatches } from './lib/match';
import { nextSlot } from './lib/schedule';
import { go, loadAnalytics, loadQa, loadReview, loadStats, loadSubmit, selectItem } from './loaders';
import { render } from './render';
import { aiBlocked, aiOutHtml } from './components/aiTable';
import { aiFill } from './lib/aiFill';
import { categoryById, standardize } from './rules';
import { proposeFromDescription } from './rules/infer';
import { ATTR_COLS, EXCEL_SRC, sourceColumns } from './rules/columns';
import { S, bump, freshImport, freshLab, freshReviewAi, freshUnspsc, resetNew } from './state';
import type { ExportKind, Item, Proof, UnspscMatch, UnspscRow, ViewId } from './types';
import { labOutHtml } from './views/lab';
import { meterHtml, previewHtml } from './views/newItem';

const field = <T extends HTMLElement>(id: string): T => $<T>(`#${id}`);
const msg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');

function downloadCsv(rows: Item[], name: string): void {
  const cols: [string, (i: Item) => string | null | undefined][] = [
    ['Request ID', (i) => i.item_id], ['Hospital', (i) => i.hospital_name], ['Hospital description', (i) => i.hospital_desc],
    ['Category', (i) => i.category], ['MPH code', (i) => i.mph_code], ['Short description', (i) => i.new_short ?? i.mph_short],
    ['Long description', (i) => i.new_long], ['Status', (i) => i.status],
  ];
  const q = (v: string | null | undefined): string => `"${(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(([h]) => q(h)).join(','), ...rows.map((r) => cols.map(([, f]) => q(f(r))).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Accept one web suggestion: fill the field and remember where it came from. */
function useWebItem(col: string): void {
  const it = S.web.result?.items.find((i) => i.column === col);
  const src = it?.sources.find((s) => /^https?:\/\//i.test(s.url));
  if (!it || !src) return;
  S.vals[col] = it.value;
  S.proofs[col] = { value: it.value, url: src.url, site: src.site, quote: it.quote };
  if (!S.src) S.src = src.url;
}

/** Rules Lab: put a value in the form together with where it came from. Typed values are never overwritten. */
function labFill(col: string, value: string, site: string, url: string, quote: string, force = false): void {
  if (!force && (S.lab.raw[col] ?? '').trim()) return;
  S.lab.raw[col] = value;
  S.lab.proofs[col] = { value, url, site, quote };
}

/** Rules Lab: use one suggestion (column + its index in the results) in the form, with its proof. */
function labPick(col: string, idx: number): void {
  const it = S.lab.web.result?.items.filter((i) => i.column === col)[idx];
  const src = it?.sources.find((x) => /^https?:\/\//i.test(x.url));
  if (it && src) labFill(col, it.value, src.site, src.url, it.quote, true);
}

/** Rules Lab: fill from the description and the Excel rules, then search the web with Firecrawl. Typed values stay. */
async function runLabLookup(): Promise<void> {
  const text = S.lab.hospital.trim();
  const urls = S.lab.urls.split(/\s+/).filter((u) => /^https?:\/\//i.test(u));
  if (text.length < 3) { toast('Type the hospital item description first.', 'warning'); return; }
  const cfg = categoryById(S.lab.cat);
  for (const [col, p] of Object.entries(proposeFromDescription(cfg, text))) labFill(col, p.value, p.from, '', p.note);
  S.lab.status = '';
  S.lab.web = { phase: 'loading', result: null };
  S.lab.unspsc = { ...freshUnspsc(), phase: 'loading' };
  render();
  // 1. the official list, searched with the hospital's words: shown in under a second, while Firecrawl reads the web
  const terms = [S.lab.raw.NOUN, S.lab.raw.TYPE, S.lab.raw.ITEM_TYPE, text].filter(Boolean).join(' ');
  const matches = unspscSearch(terms).catch((e: unknown) => { S.lab.unspsc.error = msg(e); return [] as UnspscRow[]; })
    .then((m) => {
      if (S.lab.unspsc.phase === 'loading') { S.lab.unspsc.matches = m.map((x) => ({ ...x, via: 'description' as const })); S.lab.unspsc.phase = 'done'; render(); }
      return m;
    });
  try {
    const r = await labSearch({ description: text, columns: ['NOUN', ...cfg.ask, 'UNSPSC'], urls });
    S.lab.web = { phase: 'done', result: r };
    // blanks get the first (best) suggestion of their column; the others stay one click away
    let added = 0;
    for (const it of r.items) {
      if (it.column === 'UNSPSC' || (S.lab.raw[it.column] ?? '').trim()) continue;
      labPick(it.column, 0);
      added++;
    }
    const cols = new Set(r.items.map((i) => i.column)).size;
    S.lab.status = `Firecrawl: ${r.results.length} page${r.results.length === 1 ? '' : 's'}, ${r.items.length} suggestion${r.items.length === 1 ? '' : 's'} for ${cols} column${cols === 1 ? '' : 's'}. ${added} blank column${added === 1 ? '' : 's'} filled with the best one.`;
  } catch (e) {
    S.lab.web = { phase: 'idle', result: null };
    toast(msg(e), 'error');
  }
  await checkUnspsc(await matches);
  render();
}

/** The product name the web found: the most likely one, else the title of the best product page. */
function webProduct(): string {
  const r = S.lab.web.result;
  if (!r) return '';
  return (r.product || r.results.find((x) => x.product_page !== false && x.confidence !== 'Low')?.title || '').trim();
}

/**
 * Rules Lab UNSPSC, after Firecrawl answers:
 * 2. the official list is searched again with the product name the web found (it knows "NEEDLE DISPO" is a hypodermic needle);
 * 3. every code a page printed is checked against the official list.
 * A printed code is chosen only when it is official and the list agrees with it; otherwise the checker picks.
 */
async function checkUnspsc(fromDesc: UnspscRow[]): Promise<void> {
  const u = S.lab.unspsc;
  const product = webProduct();
  const found = (S.lab.web.result?.items ?? []).filter((i) => i.column === 'UNSPSC' && /^\d{8}$/.test(i.value));
  const [fromWeb, rows] = await Promise.all([
    product ? unspscSearch([S.lab.raw.NOUN, product].filter(Boolean).join(' ')).catch((e: unknown) => { u.error = msg(e); return [] as UnspscRow[]; }) : [],
    unspscGet([...new Set(found.map((i) => i.value))]).catch((e: unknown) => { u.error = msg(e); return [] as UnspscRow[]; }),
  ]);
  u.product = fromWeb.length ? product : '';
  u.web = found.map((i) => ({ code: i.value, quote: i.quote, sources: i.sources, row: rows.find((r) => r.code === i.value) ?? null }));
  // found both ways first, then the web product name's matches, then the description's
  const descCodes = new Set(fromDesc.map((m) => m.code));
  const webCodes = new Set(fromWeb.map((m) => m.code));
  const merged: UnspscMatch[] = [
    ...fromWeb.filter((m) => descCodes.has(m.code)).map((m) => ({ ...m, via: 'both' as const })),
    ...fromWeb.filter((m) => !descCodes.has(m.code)).map((m) => ({ ...m, via: 'web' as const })),
    ...fromDesc.filter((m) => !webCodes.has(m.code)).map((m) => ({ ...m, via: 'description' as const })),
  ];
  u.matches = merged.slice(0, 8);
  const agreed = u.web.find((w) => w.row && merged.some((m) => m.code === w.code));
  u.chosen ||= agreed?.code ?? ''; // a code the checker already picked stays
  u.phase = 'done';
}

/** Review rows: AI fills every column of the selected row. */
async function runReviewAi(id: string): Promise<void> {
  const det = S.review.detail;
  if (!det || det.item_id !== id) return;
  S.review.ai = { ...freshReviewAi(), id, phase: 'loading' };
  render();
  // only the blanks are filled: what is already in the file stays as it is
  const base: { raw: Record<string, string>; proofs: Record<string, Proof> } = { raw: {}, proofs: {} };
  for (const c of ATTR_COLS) {
    const v = det.pasia_data[c.key];
    if (typeof v === 'string' && v.trim()) { base.raw[c.key] = v; base.proofs[c.key] = { value: v, url: '', site: 'Already in the file', quote: '' }; }
  }
  const res = await aiFill(det.category ?? '', det.hospital_desc ?? '', [], base);
  if (S.review.selected !== id) return; // the analyst moved to another row meanwhile
  S.review.ai = { ...res, id, phase: 'done' };
  if (res.error) toast(res.error, 'error');
  render();
}

/** Review rows: send the AI-filled proposal to QA, with the proof of every value. */
async function sendReviewAi(id: string): Promise<void> {
  const det = S.review.detail;
  const ai = S.review.ai;
  if (!det || det.item_id !== id || ai.id !== id) return;
  const cat = det.category ?? '';
  const problems = aiBlocked(cat, ai.raw);
  if (problems[0]) { toast(`Fix this first: ${problems[0]}`, 'warning'); return; }
  const r = standardize(categoryById(cat), ai.raw);
  const proof: Record<string, { source: string; url: string; quote: string }> = {};
  for (const k of Object.keys(r.vals)) {
    const p = ai.proofs[k];
    const same = !!p && (ai.raw[k] ?? '').trim().toUpperCase() === p.value.trim().toUpperCase();
    proof[k] = same && p ? { source: p.site, url: p.url, quote: p.quote } : { source: 'Typed by Production', url: '', quote: '' };
  }
  const src = Object.fromEntries(Object.entries(sourceColumns(ai.raw, ai.proofs)).flatMap(([k, v]) => (EXCEL_SRC[k] ? [[EXCEL_SRC[k], v]] : [])));
  await saveProposal(id, { new_short: r.short, new_long: r.long, pasia_data: { ...det.pasia_data, ...r.vals, ...src, AI_PROOF: proof } });
  bump(det.status, 'Pending QA');
  toast(`${id} was sent to QA with the sources.`, 'success');
  S.review.ai = freshReviewAi();
  await loadReview();
}

/** Move one item to a new status and keep the counters honest. */
async function moveItem(id: string, from: string | null, to: string): Promise<void> {
  await setStatus(id, to);
  bump(from, to);
}

const reload = (list: string | undefined): Promise<void> => (list === 'qa' ? loadQa() : loadReview());

export async function onClick(e: MouseEvent): Promise<void> {
  const t = (e.target as HTMLElement).closest('button');
  if (!t || t.disabled) return;
  const d = t.dataset;

  try {
    if (d.togglepw) {
      const inp = field<HTMLInputElement>(d.togglepw);
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      t.setAttribute('aria-pressed', String(show));
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      t.title = show ? 'Hide password' : 'Show password';
      inp.focus();
      return;
    }
    if (d.v) { await go(d.v as ViewId); $('#main').focus(); return; }
    if (d.sample !== undefined) { const s = SAMPLES[+d.sample]; if (s) { S.input = { ...s }; render(); } return; }
    if (d.labclear !== undefined) { S.lab = freshLab(S.lab.cat); return render(); }
    if (d.labpick !== undefined) { labPick(d.labpick, +(d.idx ?? 0)); return render(); }
    if (d.unspsc !== undefined) { S.lab.unspsc.chosen = S.lab.unspsc.chosen === d.unspsc ? '' : d.unspsc; return render(); }
    if (d.gtab) { S.guideTab = d.gtab; return render(); }
    if (d.webuse) { useWebItem(d.webuse); syncDesc(); return render(); }
    if (d.resetdesc) {
      S.desc[d.resetdesc === 'long' ? 'eLong' : 'eShort'] = false;
      syncDesc();
      const p = document.querySelector('.preview');
      if (p) p.innerHTML = previewHtml();
      return;
    }
    if (d.pick) return await selectItem(d.pick);

    if (d.list && d.page) {
      const q = d.list === 'qa' ? S.qa : S.review;
      q.page = Math.max(1, q.page + +d.page);
      return await reload(d.list);
    }
    if (d.list && d.pill !== undefined) {
      const q = d.list === 'qa' ? S.qa : S.review;
      q.status = d.pill; q.page = 1;
      if (d.list === 'qa') S.decided = {};
      return await reload(d.list);
    }

    if (d.aifill !== undefined) { await runReviewAi(d.aifill); return; }
    if (d.aisend !== undefined) { await sendReviewAi(d.aisend); return; }

    // Review existing rows: move the selected row
    if (d.act && d.id) {
      const from = S.review.detail?.status ?? null;
      const to = { accept: 'Pending QA', mph: 'FOR MPH VALIDATION', ticket: 'FOR HOSPITAL TICKET' }[d.act];
      if (!to) return;
      t.disabled = true;
      await moveItem(d.id, from, to);
      toast(d.act === 'accept' ? `${d.id} was sent to QA for approval.` : `${d.id} moved to “${to}”.`, 'success');
      S.review.selected = d.id;
      return await loadReview();
    }

    // QA approval
    if (d.qa) {
      t.disabled = true;
      const to = d.a === 'Approved' ? 'Approved' : 'Returned';
      await moveItem(d.qa, 'Pending QA', to);
      S.decided[d.qa] = to;
      toast(to === 'Approved' ? `${d.qa} approved.` : `${d.qa} returned to Production.`, to === 'Approved' ? 'success' : 'warning');
      return render();
    }
    if (d.undo) {
      t.disabled = true;
      const was = S.decided[d.undo] ?? 'Approved';
      await moveItem(d.undo, was, 'Pending QA');
      delete S.decided[d.undo];
      toast(`Decision on ${d.undo} was undone. It is pending again.`, 'info');
      return render();
    }

    switch (t.id) {
      case 'retry-stats': return await loadStats();
      case 'signout': return void (await signOut());

      // New item wizard
      case 'go1': {
        const text = field<HTMLTextAreaElement>('hdesc').value.trim();
        S.input = { h: field<HTMLSelectElement>('hosp').value, t: text };
        if (!text) return toast('Enter the hospital description first.', 'warning');
        t.disabled = true; t.textContent = 'Searching…';
        S.matches = await findMatches(text, S.input.h);
        S.step = 2;
        return render();
      }
      case 'back':
        if (S.chosen && S.step === 3) S.chosen = null; // leaving the mapping: back to the match list
        S.step = (S.step === 3 ? 2 : S.step - 1) as typeof S.step;
        return render();
      case 'nomatch':
        S.cls = classify(S.input.t) ?? { noun: '', type: '', category: '', unspsc: '', why: '' };
        S.step = 3;
        return render();
      case 'go3': {
        const noun = field<HTMLInputElement>('c_noun').value.trim().toUpperCase();
        const type = field<HTMLInputElement>('c_type').value.trim().toUpperCase();
        const category = field<HTMLInputElement | HTMLSelectElement>('c_cat').value.trim();
        const unspsc = field<HTMLInputElement>('c_unspsc').value.trim();
        if (!noun || !type) return toast('Noun and Type are required.', 'warning');
        if (!category) return toast('Choose the MPH category.', 'warning');
        if (unspsc && !/^\d{8}$/.test(unspsc)) return toast('UNSPSC commodity is 8 digits, or leave it empty.', 'warning');
        S.cls = { noun, type, category, unspsc, why: S.cls?.why ?? '' };
        if (S.chosen) S.vals = { ...S.vals, NOUN: noun, TYPE: type }; // keep what came from the chosen item
        else {
          S.vals = { ...prefillFromText(S.input.t), NOUN: noun, TYPE: type };
          S.desc = { short: '', long: '', eShort: false, eLong: false };
          S.web = { phase: 'idle', result: null };
          S.proofs = {};
          syncDesc();
        }
        S.step = 4;
        return render();
      }
      case 'go4': {
        if (!S.cls) return;
        const miss = REQUIRED.filter((c) => !(S.vals[c] ?? '').trim());
        if (!S.src) miss.push('Source link');
        if (miss.length) return toast(`Required: ${miss.join(', ')}`, 'warning');
        const short = S.desc.short.trim();
        if (!short) return toast('The short description is empty.', 'warning');
        if (short.length > SHORT_LIMIT) return toast(`The short description is over ${SHORT_LIMIT} characters. Shorten it.`, 'warning');
        t.disabled = true; t.textContent = 'Checking…';
        S.dups = S.chosen ? [] : await fetchDuplicates(short); // mapping to an existing code is a "duplicate" on purpose
        S.step = 5;
        if (S.dups.length) toast('An item with this exact short description already exists. Check before you submit.', 'warning');
        return render();
      }
      case 'submit': {
        if (!S.cls) return;
        t.disabled = true;
        const attrs = Object.fromEntries(Object.entries(S.vals).filter(([, v]) => v.trim()));
        const id = await insertRequest({
          hospital_name: S.input.h, hospital_desc: S.input.t, category: S.cls.category, new_short: S.desc.short.trim(), new_long: S.desc.long.trim(),
          unspsc_commodity: S.cls.unspsc || undefined, status: 'Pending QA',
          ...(S.chosen ? { mph_code: S.chosen.code, mph_short: S.chosen.short } : {}),
          remarks: `${S.chosen ? `Mapped to existing code ${S.chosen.code}. ` : ''}Source: ${S.src}`,
          pasia_data: {
            ...attrs, ...(S.cls.unspsc ? { COMMODITY: S.cls.unspsc } : {}), source: S.src, attachment_names: S.files,
            // proof links, only for values the analyst kept as found
            sources: Object.fromEntries(Object.entries(S.proofs).filter(([c, p]) => (S.vals[c] ?? '').trim().toUpperCase() === p.value.trim().toUpperCase())),
          },
        });
        bump(null, 'Pending QA');
        toast(`${id} was submitted for QA.`, 'success');
        resetNew();
        S.qa.status = 'Pending QA'; S.qa.page = 1;
        return await go('qa');
      }

      // Batch import
      case 'impreset': S.imp = freshImport(); return render();
      case 'doimport': {
        if (S.role !== 'qa') return toast('Only a QA reviewer can import.', 'error');
        S.imp.phase = 'importing'; S.imp.done = 0;
        render();
        try {
          await importRows(S.imp.rows, S.imp.mode, (n) => { S.imp.done = n; render(); });
          S.imp.phase = 'done';
          toast(`${S.imp.rows.length.toLocaleString('en-US')} rows were sent to the database.`, 'success');
          S.stats = null;
          void loadStats(false);
          void loadAnalytics();
        } catch (err) { S.imp.phase = 'ready'; toast(msg(err), 'error'); }
        return render();
      }

      // Submissions and export
      case 'weblookup': {
        if (!S.cls) return;
        S.web = { phase: 'loading', result: S.web.result };
        render();
        try {
          const r = await webLookup({ description: S.input.t, hospital: S.input.h, noun: S.cls.noun, type: S.cls.type });
          S.web = { phase: 'done', result: r };
          if (r.items.length) toast(`${r.items.length} attribute(s) found with a source link. Check them, then use them.`, 'success');
          else toast('Nothing could be proven from a web page for this item.', 'warning');
        } catch (err) { S.web = { phase: 'idle', result: S.web.result }; toast(msg(err), 'error'); }
        return render();
      }
      case 'webuseall':
        S.web.result?.items.forEach((i) => useWebItem(i.column));
        syncDesc();
        toast('Values filled in. Check each source before you submit.', 'info');
        return render();
      case 'doexp': {
        S.submit.busy = true; render();
        try {
          const rows = await fetchExport(S.submit.kind);
          if (!rows.length) toast('There is nothing to export for this choice yet.', 'warning');
          else { downloadCsv(rows, `mph-${S.submit.kind}`); toast(`${rows.length.toLocaleString('en-US')} rows downloaded.`, 'success'); }
        } finally { S.submit.busy = false; render(); }
        return;
      }
      case 'marksent': {
        if (S.role !== 'qa') return toast('Only a QA reviewer can mark a submission.', 'error');
        const by = S.stats?.by_status ?? {};
        const rows = (by.Approved ?? 0) + (by.Mapped ?? 0);
        t.disabled = true;
        await insertSubmission(nextSlot().label, rows, S.user?.name ?? '');
        toast(`Recorded: ${rows.toLocaleString('en-US')} rows submitted (${nextSlot().label}).`, 'success');
        return await loadSubmit();
      }
    }

    if (d.use !== undefined) {
      const m = S.matches[+d.use];
      if (!m) return;
      // nothing is saved yet: Classify and Attributes open pre-filled from this item, ready to confirm
      t.disabled = true; t.textContent = 'Loading…';
      const row = await fetchItem(m.itemId);
      const [pn = '', pt = ''] = m.short.split(';');
      const own = row?.pasia_data ?? {};
      const vals: Record<string, string> = {};
      for (const a of ATTRS) { const v = own[a.col]; if (typeof v === 'string' && v.trim()) vals[a.col] = v.trim(); else if (typeof v === 'number') vals[a.col] = String(v); }
      const noun = vals.NOUN ?? pn.trim().toUpperCase();
      const type = vals.TYPE ?? pt.trim().toUpperCase();
      S.chosen = m;
      S.cls = { noun, type, category: m.cat, unspsc: m.unspsc, why: `Taken from the chosen MPH code ${m.code}` };
      S.vals = { ...vals, NOUN: noun, TYPE: type };
      S.desc = { short: m.short, long: m.long || m.short, eShort: true, eLong: true };
      S.step = 3;
      return render();
    }
  } catch (err) {
    toast(msg(err), 'error');
    render();
  }
}

export async function onChange(e: Event): Promise<void> {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  try {
    if (t.id === 'src') S.src = t.value;
    else if (t.id === 'labcat') { S.lab = freshLab(categoryById(t.value).id, S.lab.hospital); render(); }
    else if (t.id === 'att') { S.files = [...((t as HTMLInputElement).files ?? [])].map((f) => f.name); render(); }
    else if (t.id === 'impmode') S.imp.mode = t.value as 'new' | 'update';
    else if (t.id === 'exkind') { S.submit.kind = t.value as ExportKind; render(); }
    else if (t.id === 'rsearch') { S.review.q = t.value; S.review.page = 1; await loadReview(); }
    else if (t.id === 'xlsx') {
      const file = (t as HTMLInputElement).files?.[0];
      if (!file) return;
      S.imp = { ...freshImport(), phase: 'parsing', fileName: file.name };
      render();
      try {
        const raw = await parseExcel(file, (n) => { S.imp.progress = n; if (S.view === 'import') render(); }, (l) => { S.imp.layout = l; });
        const byId = new Map(raw.map((r) => [r.item_id, r]));
        S.imp.rows = [...byId.values()];
        S.imp.dupes = raw.length - byId.size;
        S.imp.phase = S.imp.rows.length ? 'ready' : 'idle';
        if (S.imp.rows.length) toast(`${S.imp.rows.length.toLocaleString('en-US')} rows read. Review them, then import.`, 'info');
        else toast('No rows were found in that file.', 'warning');
      } catch (err) { S.imp = freshImport(); toast(msg(err), 'error'); }
      render();
    }
  } catch (err) { toast(msg(err), 'error'); }
}

export function onInput(e: Event): void {
  const t = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (t.id === 'src') S.src = t.value;
  else if (t.id === 'hdesc') S.input.t = t.value;
  else if (t.id === 'labh') S.lab.hospital = t.value;
  else if (t.id === 'labu') S.lab.urls = t.value;
  else if (t.dataset.rai) {
    S.review.ai.raw[t.dataset.rai] = t.value;
    const out = document.getElementById('rai-out');
    if (out) out.innerHTML = aiOutHtml(S.review.detail?.category ?? '', S.review.ai.raw);
  } else if (t.dataset.lab) {
    S.lab.raw[t.dataset.lab] = t.value;
    const out = document.getElementById('lab-out');
    if (out) out.innerHTML = labOutHtml(); // redraw only the result so the input keeps focus
  }
  else if (t.dataset.attr) {
    S.vals[t.dataset.attr] = t.value;
    syncDesc();
    const p = document.querySelector('.preview');
    if (p) p.innerHTML = previewHtml(); // refresh only the preview so the input keeps focus
  } else if (t.dataset.desc === 'short' || t.dataset.desc === 'long') {
    const long = t.dataset.desc === 'long';
    S.desc[long ? 'long' : 'short'] = t.value;
    S.desc[long ? 'eLong' : 'eShort'] = true;
    const m = document.getElementById('meter');
    if (m) m.innerHTML = meterHtml();
    document.querySelectorAll<HTMLElement>(`[data-resetdesc="${t.dataset.desc}"]`).forEach((b) => { b.hidden = false; });
  }
}

export async function onSubmit(e: SubmitEvent): Promise<void> {
  const f = e.target as HTMLFormElement;
  if (f.id === 'labform') { e.preventDefault(); if (S.lab.web.phase !== 'loading') await runLabLookup(); return; }
  if (f.id !== 'login') return;
  e.preventDefault();
  await signIn(field<HTMLInputElement>('email').value.trim(), field<HTMLInputElement>('password').value);
}
