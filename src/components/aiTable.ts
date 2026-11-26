import { esc } from '../lib/dom';
import { SHORT_LIMIT, categoryById, standardize } from '../rules';
import { ATTR_COLS, SOURCE_COLS, sourceColumns } from '../rules/columns';
import type { Proof } from '../types';

const KIND = { error: 'bad', warn: 'warn', info: 'info' } as const;
export const isHttp = (u: string): boolean => /^https?:\/\//i.test(u);

function meter(n: number): string {
  const over = n > SHORT_LIMIT;
  return `<div class="ruler${over ? ' over' : ''}" aria-hidden="true">${Array.from({ length: SHORT_LIMIT }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
    <div class="count${over ? ' over' : ''}">${n} of ${SHORT_LIMIT} characters${over ? ': too long' : ''}</div>`;
}

/** Short and long description (MPH rules) plus the checks. Redrawn on every keystroke without touching the inputs. */
export function aiOutHtml(catId: string, raw: Record<string, string>): string {
  const r = standardize(categoryById(catId), raw);
  if (!Object.keys(r.vals).length) return '<p class="hint">Nothing filled yet.</p>';
  const checks = r.findings.filter((f) => f.level !== 'info');
  return `<span class="label">Short description</span><code>${esc(r.short) || '—'}</code>${meter(r.short.length)}
    <span class="label">Long description</span><code>${esc(r.long) || '—'}</code>
    ${checks.length ? checks.map((f) => `<div class="banner ${KIND[f.level]}">${esc(f.msg)}</div>`).join('') : '<div class="banner good">All checks passed.</div>'}`;
}

/** True when the item still has a problem that must be fixed before it goes to QA. */
export function aiBlocked(catId: string, raw: Record<string, string>): string[] {
  return standardize(categoryById(catId), raw).findings.filter((f) => f.level === 'error').map((f) => f.msg);
}

/** Every column, its value (editable), where it came from and why. Blank = nothing found, on purpose. */
export function aiTableHtml(raw: Record<string, string>, proofs: Record<string, Proof>, attr: string): string {
  const rows = ATTR_COLS.map((c) => {
    const v = raw[c.key] ?? '';
    const p = proofs[c.key];
    const same = !!p && !!v.trim() && p.value.trim().toUpperCase() === v.trim().toUpperCase();
    const src = !v.trim() ? '<span class="hint">not found</span>'
      : !p || !same ? '<span class="hint">typed by you</span>'
      : isHttp(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.site || p.url)}</a>` : esc(p.site);
    return `<tr><td>${esc(c.label)}</td><td><input type="text" data-${attr}="${esc(c.key)}" value="${esc(v)}" aria-label="${esc(c.label)}" autocomplete="off"></td>
      <td>${src}</td><td class="hint">${p && same ? esc(p.quote) : ''}</td></tr>`;
  }).join('');
  const sc = sourceColumns(raw, proofs);
  const srows = SOURCE_COLS.map((c) => {
    const v = sc[c.key] ?? '';
    return `<tr><td class="hint">${esc(c.label)}</td><td colspan="3">${!v ? '<span class="hint">—</span>' : isHttp(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v)}</td></tr>`;
  }).join('');
  return `<div class="tablewrap"><table><thead><tr><th>Column</th><th>Value</th><th>Source</th><th>Why</th></tr></thead><tbody>${rows}${srows}</tbody></table></div>`;
}
