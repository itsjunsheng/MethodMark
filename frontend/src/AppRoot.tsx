import { useToastError } from './components/Toast';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { AuthDialog } from './components/AuthDialog';
import type { AuthMode } from './components/AuthDialog';
import { Brand } from './components/Brand';
import { LandingPage } from './components/LandingPage';
import { logOut } from './lib/supabase';
import { useTutorAuth } from './lib/useTutorAuth';

const App = lazy(() => import('./App'));
const StudentAccess = lazy(() => import('./components/StudentAccess'));

async function signOutToLogin() {
  const confirmed = await logOut();
  location.replace(confirmed ? '/?view=login' : '/?view=login&notice=logout-unconfirmed');
}

function TutorEntry() {
  const { session, loading, error, recovery } = useTutorAuth();
  const [view, setView] = useState(() => new URLSearchParams(location.search).get('view'));
  useEffect(() => {
    const syncView = () => setView(new URLSearchParams(location.search).get('view'));
    addEventListener('popstate', syncView);
    return () => removeEventListener('popstate', syncView);
  }, []);

  function navigateAuth(mode: AuthMode | null) {
    const url = new URL(location.href);
    url.searchParams.delete('notice');
    if (mode) url.searchParams.set('view', mode);
    else url.searchParams.delete('view');
    history.pushState(null, '', url);
    setView(mode);
  }

  // Keep ordinary auth links usable in new tabs, while opening normal clicks in-place.
  function openAuthLink(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest('a');
    if (!link) return;
    const url = new URL(link.href);
    const mode = url.searchParams.get('view');
    if (url.origin !== location.origin || url.pathname !== '/' || !['login', 'signup', 'forgot-password', 'reset-password'].includes(mode || '')) return;
    event.preventDefault();
    navigateAuth(mode as AuthMode);
  }
  const [invalidLink] = useState(() => new URLSearchParams(location.hash.slice(1)).has('error'));
  const reset = view === 'reset-password' || recovery;
  useToastError(!reset && !invalidLink ? error : '');
  useEffect(() => {
    document.title = reset ? 'Reset password | MethodMark' : session ? 'MethodMark | Tutor'
      : view === 'login' || view === 'workspace' ? 'Log in | MethodMark' : view === 'signup' ? 'Create an account | MethodMark'
        : view === 'forgot-password' ? 'Reset password | MethodMark' : 'MethodMark | More room for teaching';
  }, [view, session, reset]);

  if (loading) return <div className="public-site auth-loading"><Brand /><p role="status">Opening MethodMark...</p></div>;
  if (error && !reset && !invalidLink) return <div className="public-site auth-loading"><Brand /><p>Please sign in again to continue.</p><button className="public-button" onClick={() => void signOutToLogin()}>Return to login</button><button className="public-text-link" onClick={() => location.reload()}>Try again</button></div>;
  // Signup manages its own confirmation flow, including projects with confirmation disabled.
  if (session && !reset && !invalidLink && view !== 'signup' && view !== 'forgot-password') return <App key={session.user.id} user={session.user} onLogout={signOutToLogin} />;
  const mode: AuthMode | null = reset || invalidLink ? 'reset-password' : view === 'signup' ? 'signup'
    : view === 'forgot-password' ? 'forgot-password' : view === 'login' || view === 'workspace' ? 'login' : null;
  return <div onClick={openAuthLink}>
    <LandingPage />
    {mode && <AuthDialog mode={mode} hasSession={!!session} invalidLink={invalidLink}
      onClose={() => { if (reset || invalidLink) location.replace('/'); else navigateAuth(null); }} />}
  </div>;
}

export default function AppRoot() {
  const assignment = new URLSearchParams(location.search).get('assignment');
  // Student links are public and never start a tutor authentication flow.
  return <Suspense fallback={<div className="public-site auth-loading"><p role="status">Loading...</p></div>}>
    {assignment ? <StudentAccess assignmentId={assignment} /> : <TutorEntry />}
  </Suspense>;
}
