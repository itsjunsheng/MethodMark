import { supabase } from '../lib/supabase';
import type { Insights } from '../types/insights';

export async function fetchInsights(signal: AbortSignal, classId = '', days = 0): Promise<Insights> {
  if (!supabase) throw new Error('Please log in to view insights.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please log in again.');
  const query = new URLSearchParams();
  if (classId) query.set('class_id', classId);
  if (days) query.set('days', String(days));
  const response = await fetch('/api/v1/insights' + (query.size ? '?' + query : ''), {
    signal, headers: { Authorization: 'Bearer ' + data.session.access_token },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not load insights. Please try again.');
  return body as Insights;
}
