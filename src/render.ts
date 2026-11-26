import { skPage } from './components/skeleton';
import { syncNav } from './components/nav';
import { $ } from './lib/dom';
import { S } from './state';
import type { ViewId } from './types';
import { vDash } from './views/dashboard';
import { vGuides } from './views/guides';
import { vLab } from './views/lab';
import { vImport } from './views/importView';
import { vLogin } from './views/login';
import { vNew } from './views/newItem';
import { vQa } from './views/qa';
import { vReview } from './views/review';
import { vSubmit } from './views/submit';

const VIEWS: Record<ViewId, () => string> = { dash: vDash, review: vReview, new: vNew, import: vImport, qa: vQa, guides: vGuides, submit: vSubmit, lab: vLab };

export function render(): void {
  document.body.classList.toggle('anon', !S.user);
  syncNav();
  if (!S.authReady) { $('#main').innerHTML = skPage(); return; }
  const main = $('#main');
  // keep the list's scroll position while the detail pane re-renders
  main.innerHTML = S.user ? VIEWS[S.view]() : vLogin();
}
