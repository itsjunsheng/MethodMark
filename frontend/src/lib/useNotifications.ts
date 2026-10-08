import { useCallback, useState } from 'react';
import type { ClassAssignment } from '../types/assignments';
import type { QueueItem } from '../types/grading';
import { workspaceKey } from './workspaceStorage';

export type Notice = { id: string; kind: 'submitted' | 'review' | 'flagged' | 'failed' | 'processing' | 'deadline'; title: string; detail: string; at: string; target: 'Marking queue' | 'Assignments' };

// Built from data the workspace already polls; nothing is stored on the server.
export function buildNotices(queue: QueueItem[], assignments: ClassAssignment[], now = Date.now()): Notice[] {
  const notices: Notice[] = queue.map(item => {
    const who = item.student_name || item.student_code;
    const at = item.updated_at || item.submitted_at;
    if (item.status === 'submitted') return { id: 'submitted:' + item.submission_id, kind: 'submitted', title: `${who} submitted ${item.paper_title}`, detail: 'Ready to send for grading / ' + item.class_name, at: item.submitted_at, target: 'Marking queue' };
    if (item.status === 'released') return null;
    if (item.status === 'failed') return { id: 'failed:' + item.submission_id, kind: 'failed', title: `Grading failed for ${who}`, detail: item.error || item.paper_title, at, target: 'Marking queue' };
    if (item.status !== 'awaiting_review') return { id: 'processing:' + item.submission_id, kind: 'processing', title: `${who} submitted ${item.paper_title}`, detail: 'AI marking in progress', at: item.submitted_at, target: 'Marking queue' };
    // The bell announces newly marked work; once the tutor opens a review it stops (the queue tracks the rest).
    if (item.review_saved_at) return null;
    return { id: 'review:' + item.submission_id, kind: item.flagged ? 'flagged' : 'review', title: `${who}’s work is ready for review`,
      detail: item.paper_title + ' / ' + item.class_name + (item.flagged ? ' / Flagged for a closer look' : ''), at, target: 'Marking queue' };
  }).filter((notice): notice is Notice => notice !== null);
  for (const assignment of assignments) {
    if (assignment.status !== 'published' || !assignment.due_at || new Date(assignment.due_at).getTime() > now) continue;
    notices.push({ id: 'deadline:' + assignment.id, kind: 'deadline', title: `${assignment.title} is ready for grading`,
      detail: `${assignment.class_name} / ${assignment.submitted_count} of ${assignment.student_count} submitted`, at: assignment.due_at, target: 'Assignments' });
  }
  // Postgres and browser timestamps use different ISO formats, so compare parsed times.
  return notices.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30);
}

export function useNotifications(userId: string, notices: Notice[]) {
  const key = workspaceKey(userId, 'notifications-seen');
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(key) || new Date(Date.now() - 7 * 86400000).toISOString(); }
    catch { return new Date(Date.now() - 7 * 86400000).toISOString(); }
  });
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeen(now);
    try { localStorage.setItem(key, now); } catch { /* Read state stays for this session only. */ }
  }, [key]);
  return { seen, unread: notices.filter(notice => Date.parse(notice.at) > Date.parse(seen)).length, markSeen };
}
