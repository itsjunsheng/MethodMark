import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useTutorAuth() {
  const [candidate, setCandidate] = useState<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(!supabase);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // Keep the subscription synchronous; verify outside the SDK's auth lock.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setCandidate(next);
      setInitialized(true);
      setError('');
      setSession(current => current?.user.id === next?.user.id ? current : null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!candidate || !supabase) return;
    let active = true;
    void supabase.auth.getUser(candidate.access_token).then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user || data.user.is_anonymous) {
        setSession(null);
        setError('Your session could not be verified. Please log in again.');
      } else setSession({ ...candidate, user: data.user });
    }).catch(() => {
      if (active) setError('We could not reach the login service. Please try again.');
    });
    return () => { active = false; };
  }, [candidate]);

  const loading = !initialized || (!!candidate && !session && !error);
  return { session, loading, error, recovery };
}
