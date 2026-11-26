import { fetchHospitals } from './api';
import { toast } from './lib/dom';
import { supabase } from './lib/supabase';
import { go } from './loaders';
import { render } from './render';
import { S, resetNew } from './state';
import type { Role } from './types';

let loadingFor: string | null = null; // a load for this user is already running
let justSignedIn = false; // true only after the login form succeeded, not when a saved session is restored

async function applySession(userId: string | null, email: string): Promise<void> {
  if (!userId) {
    const wasIn = !!S.user;
    S.user = null;
    S.authReady = true;
    S.stats = null;
    S.statsLoading = false;
    S.statsError = '';
    S.analytics = null;
    S.hospitalStats = null;
    S.decided = {};
    render();
    if (wasIn) toast('You have been signed out.', 'info');
    return;
  }
  if (S.user?.id === userId || loadingFor === userId) return; // token refresh or duplicate event: nothing to reload
  loadingFor = userId;
  try {
    const { data: p, error } = await supabase.from('profiles').select('role,full_name').eq('id', userId).maybeSingle();
    if (error || !p) {
      toast('Your account has no role yet. Ask the admin to set it up.', 'error');
      await supabase.auth.signOut();
      return;
    }
    S.user = { id: userId, email, name: (p.full_name as string) || email };
    S.role = p.role as Role;
    S.hospitals = [];
    resetNew();
    S.authReady = true;
    S.view = 'dash';
    if (justSignedIn) {
      justSignedIn = false;
      toast(`Welcome, ${S.user.name}. You are signed in as ${S.role === 'qa' ? 'QA reviewer' : 'Production analyst'}.`, 'success');
    }
    // Hospital options are independent of dashboard counts; do not block the page on them.
    void fetchHospitals().then(hospitals => {
      if (S.user?.id !== userId) return;
      S.hospitals = hospitals;
      if (!S.input.h) S.input.h = hospitals[0] ?? '';
      render();
    }).catch(() => {});
    await go('dash');
  } finally {
    loadingFor = null;
  }
}

export function initAuth(): void {
  // Fires once with the saved session, then on sign-in / sign-out.
  supabase.auth.onAuthStateChange((_event, session) => {
    // defer: supabase calls must not run inside this callback
    setTimeout(() => { void applySession(session?.user.id ?? null, session?.user.email ?? ''); }, 0);
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  justSignedIn = true; // set before the call: the session event can arrive before it resolves
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) justSignedIn = false;
  if (error) toast(error.message === 'Invalid login credentials' ? 'Wrong email or password. Try again.' : error.message, 'error');
}

export const signOut = (): Promise<unknown> => supabase.auth.signOut();
