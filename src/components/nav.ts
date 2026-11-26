import { S } from '../state';
import type { ViewId } from '../types';
import { $ } from '../lib/dom';
import { icon, type IconName } from './icons';

const LINKS: { id: ViewId; label: string; icon: IconName; qaOnly?: boolean }[] = [
  { id: 'dash', label: 'Dashboard', icon: 'grid' },
  { id: 'review', label: 'Review existing rows', icon: 'review' },
  { id: 'new', label: 'New item', icon: 'plus' },
  { id: 'import', label: 'Batch import', icon: 'upload', qaOnly: true },
  { id: 'qa', label: 'QA approval', icon: 'shield' },
  { id: 'guides', label: 'Attribute guides', icon: 'book' },
  { id: 'submit', label: 'Submissions and export', icon: 'send' },
  { id: 'lab', label: 'Rules Lab', icon: 'table' },
];

/** Rendered once; syncNav() updates the active link, QA count and user card afterwards. */
export function mountNav(): void {
  $('#nav').innerHTML = `
    <div class="brand"><span class="logo">M</span><span><b>MPH Items</b><small>Item standardization</small></span></div>
    <nav aria-label="Portal sections">
      ${LINKS.map((l) => `<button data-v="${l.id}">${icon(l.icon)}<span>${l.label}</span>${l.id === 'qa' ? '<span class="pill" id="qcount" hidden></span>' : ''}</button>`).join('')}
    </nav>
    <div class="role">
      <div class="usercard"><span class="avatar" id="avatar"></span>
        <span><span class="who" id="who"></span><span class="hint-side" id="whorole"></span></span></div>
      <button class="signout" id="signout">Sign out</button>
    </div>`;
}

const initials = (name: string): string => name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function syncNav(): void {
  document.querySelectorAll<HTMLButtonElement>('#nav nav button').forEach((b) => {
    b.hidden = LINKS.find((l) => l.id === b.dataset.v)?.qaOnly === true && S.role !== 'qa';
    if (b.dataset.v === S.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const pending = S.stats?.by_status['Pending QA'] ?? 0;
  const q = $('#qcount');
  q.hidden = pending === 0;
  q.textContent = pending.toLocaleString('en-US');
  $('#who').textContent = S.user?.name ?? '';
  $('#avatar').textContent = initials(S.user?.name ?? '');
  $('#whorole').textContent = S.role === 'qa' ? 'QA reviewer' : 'Production analyst';
}
