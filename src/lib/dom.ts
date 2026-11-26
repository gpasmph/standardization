export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: string | number): string => String(s).replace(/[&<>"]/g, (c) => ESC[c] ?? c);

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

const ICON: Record<ToastKind, string> = {
  success: '<path d="M5 12l5 5L20 7"/>',
  error: '<path d="M18 6L6 18M6 6l12 12"/>',
  warning: '<path d="M12 8v5M12 17h.01"/>',
  info: '<path d="M12 11v6M12 7h.01"/>',
};
const TITLE: Record<ToastKind, string> = { success: 'Done', error: 'Something went wrong', warning: 'Check this', info: 'Note' };

/** Stacked notification. Errors stay longer; every toast can be dismissed. */
export function toast(msg: string, kind: ToastKind = 'info', ms = kind === 'error' ? 8000 : 4500): void {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[kind]}</svg></span>
    <span class="toast-body"><b>${TITLE[kind]}</b><span>${esc(msg)}</span></span>
    <button class="toast-x" aria-label="Dismiss notification"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
  const close = (): void => { el.classList.add('out'); window.setTimeout(() => el.remove(), 180); };
  el.querySelector('.toast-x')?.addEventListener('click', close);
  box.append(el);
  while (box.children.length > 4) box.firstElementChild?.remove();
  window.setTimeout(close, ms);
}
