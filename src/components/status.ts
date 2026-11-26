import { esc } from '../lib/dom';

const CLASS: Record<string, string> = {
  'Ongoing Review': 'rev',
  'FOR MPH VALIDATION': 'mph',
  'FOR HOSPITAL TICKET': 'pqa',
  'Pending QA': 'pqa',
  Returned: 'rej',
  Approved: 'app',
  Mapped: 'map',
};

export const chip = (status: string | null): string =>
  `<span class="chip ${CLASS[status ?? ''] ?? 'rev'}">${esc(status ?? '—')}</span>`;

export const pageHead = (title: string, sub: string, right = ''): string =>
  `<header class="page-head"><div><h1>${title}</h1><p class="sub">${sub}</p></div>${right}</header>`;

/** A pill-style filter button, with an optional count. */
export const pill = (label: string, active: boolean, attrs: string, count?: number): string =>
  `<button class="pillbtn${active ? ' on' : ''}" ${attrs}${active ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${label}${count === undefined ? '' : ` <span>${count.toLocaleString('en-US')}</span>`}</button>`;

export const banner = (kind: 'info' | 'good' | 'warn' | 'bad', html: string): string => `<div class="banner ${kind === 'warn' ? 'warnb' : kind}" role="status">${html}</div>`;
