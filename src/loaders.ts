import { fetchAnalytics, fetchHospitalStats, fetchItem, fetchQueue, fetchStats, fetchSubmissions } from './api';
import { toast } from './lib/dom';
import { render } from './render';
import { S, freshReviewAi } from './state';
import type { ViewId } from './types';

const fail = (e: unknown): void => toast(e instanceof Error ? e.message : 'Something went wrong', 'error');

let statsRequest: { user: string | undefined; promise: Promise<void> } | null = null;
export async function loadStats(_showLoading = true): Promise<void> {
  const user = S.user?.id;
  if (statsRequest?.user === user && statsRequest) return statsRequest.promise;
  S.statsLoading = true;
  S.statsError = '';
  render();
  const request = { user, promise: Promise.resolve() };
  statsRequest = request;
  request.promise = (async () => {
    try {
      const stats = await fetchStats();
      if (S.user?.id === user) S.stats = stats;
    } catch (e) {
      if (S.user?.id === user) S.statsError = e instanceof Error ? e.message : 'Could not load dashboard.';
    } finally {
      if (statsRequest === request) {
        statsRequest = null;
        if (S.user?.id === user) { S.statsLoading = false; render(); }
      }
    }
  })();
  return request.promise;
}

/** Dashboard analytics. Failures are silent: the dashboard falls back to the basic bars (e.g. the SQL was not run yet). */
let analyticsUser: string | undefined;
export async function loadAnalytics(): Promise<void> {
  const user = S.user?.id;
  if (analyticsUser === user && S.analyticsLoading) return;
  analyticsUser = user;
  S.analyticsLoading = true;
  render();
  const [a, h] = await Promise.allSettled([fetchAnalytics(), fetchHospitalStats()]);
  if (S.user?.id !== user) return;
  if (a.status === 'fulfilled') S.analytics = a.value;
  if (h.status === 'fulfilled') S.hospitalStats = h.value;
  S.analyticsLoading = false;
  render();
}

export async function selectItem(id: string): Promise<void> {
  S.review.selected = id;
  S.review.ai = freshReviewAi();
  S.review.detailLoading = true;
  render();
  try { S.review.detail = await fetchItem(id); } catch (e) { fail(e); S.review.detail = null; }
  S.review.detailLoading = false;
  render();
}

export async function loadReview(): Promise<void> {
  const r = S.review;
  r.loading = true;
  render();
  try {
    const { rows, total } = await fetchQueue(r);
    r.rows = rows;
    r.total = total;
  } catch (e) { fail(e); }
  r.loading = false;
  const first = r.rows[0];
  if (first && !r.rows.some((x) => x.item_id === r.selected)) return selectItem(first.item_id);
  if (!first) r.detail = null;
  render();
}

export async function loadQa(): Promise<void> {
  S.qa.loading = true;
  render();
  try {
    const { rows, total } = await fetchQueue(S.qa, true);
    S.qa.rows = rows;
    S.qa.total = total;
  } catch (e) { fail(e); }
  S.qa.loading = false;
  render();
}

export async function loadSubmit(): Promise<void> {
  S.submit.loading = true;
  render();
  try { S.submit.history = await fetchSubmissions(); } catch (e) { fail(e); }
  S.submit.loading = false;
  render();
}

/** Switch view and load the data that view needs. */
export async function go(view: ViewId): Promise<void> {
  S.view = view;
  render();
  if (view === 'dash') await Promise.all([loadStats(), loadAnalytics()]);
  else {
    if (!S.stats) void loadStats(false);
    if (view === 'review') await loadReview();
    else if (view === 'qa') await loadQa();
    else if (view === 'submit') await loadSubmit();
  }
}
