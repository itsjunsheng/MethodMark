import type { ClassAssignment } from '../types/assignments';

export function assignmentStatus(assignment: ClassAssignment, now = Date.now()) {
  if (assignment.status === 'closed') return 'Closed';
  return assignment.due_at && new Date(assignment.due_at).getTime() <= now ? 'Ready for grading' : 'Published';
}
export function singaporeDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' SGT' : 'No deadline';
}
export function defaultDeadline() {
  return new Date(Date.now() + 7 * 86400000 + 8 * 3600000).toISOString().slice(0, 10) + 'T23:59';
}
export function assignmentLink(token: string) {
  return window.location.origin + '/?assignment=' + encodeURIComponent(token);
}
