import { supabase } from '../lib/supabase';
import type { BankQuestion } from '../types/questionBank';

export async function fetchQuestions(signal: AbortSignal): Promise<BankQuestion[]> {
  if (!supabase) throw new Error('Tutor login is not configured.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please log in to load the question bank.');
  let response: Response;
  try {
    response = await fetch('/api/v1/sample-paper/questions', { signal, headers: { Authorization: `Bearer ${data.session.access_token}` } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Could not reach the server. Check that the backend is running, then try again.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : 'Could not load the question bank. Check that the backend is running, then try again.',
    );
  }
  if (!Array.isArray(body)) throw new Error('The server returned an invalid question list.');
  return body;
}
