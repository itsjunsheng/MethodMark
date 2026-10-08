import { supabase } from '../lib/supabase';
import { toPaper } from './assignments';
import type { PaperRow } from './assignments';
import type { GradingDetail, QueueItem, ReviewDraft } from '../types/grading';

async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error('Please log in to view the marking queue.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please log in again.');
  const response = await fetch('/api/v1/grading' + path, { ...options, headers: {
    'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token,
  } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not load or save the assessment. Please try again.');
  return body as T;
}
export const listGrading = (signal: AbortSignal) => request<QueueItem[]>('', { signal });
export const sendClassForGrading = (classId: string) =>
  request<{ queued: number }>('/classes/' + classId + '/send', { method: 'POST' });
export async function getGrading(id: string, signal: AbortSignal): Promise<GradingDetail> {
  const data = await request<Omit<GradingDetail, 'paper'> & { paper: PaperRow }>('/' + id, { signal });
  return { ...data, paper: toPaper(data.paper) };
}
export const retryGrading = (id: string) => request('/' + id + '/retry', { method: 'POST' });
export const saveReview = (id: string, version: number, draft: ReviewDraft) =>
  request<{ version: number; review_saved_at: string }>('/' + id + '/review', {
    method: 'PUT', body: JSON.stringify({ version, draft }),
  });
export const releaseResult = (id: string, version: number, draft: ReviewDraft) =>
  request<{ version: number; released_at: string }>('/' + id + '/release', {
    method: 'POST', body: JSON.stringify({ version, draft }),
  });
export const reopenResult = (id: string, version: number) =>
  request<{ version: number }>('/' + id + '/reopen', { method: 'POST', body: JSON.stringify({ version }) });
