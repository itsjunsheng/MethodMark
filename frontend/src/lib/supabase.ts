import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const authStorageKey = 'methodmark-auth';

// Only the public key belongs in the browser. Passwords are handled by Supabase Auth.
export const supabase = url && key && !key.startsWith('sb_secret_')
  ? createClient(url, key, { auth: { storageKey: authStorageKey } }) : null;

export async function logOut() {
  try {
    const result = await supabase?.auth.signOut({ scope: 'local' });
    return !result?.error;
  } catch {
    return false;
  } finally {
    // Clear this browser even when the remote logout request fails.
    await supabase?.auth.stopAutoRefresh();
    for (const key of [authStorageKey, `${authStorageKey}-code-verifier`, `${authStorageKey}-user`]) {
      try { localStorage.removeItem(key); } catch { /* The redirect still closes the workspace. */ }
    }
  }
}
