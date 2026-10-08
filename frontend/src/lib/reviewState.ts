import type { QueueItem } from '../types/grading';

export const gradingLabels = { submitted: 'Not yet sent for grading', queued: 'Queued', processing: 'Processing', awaiting_review: 'Awaiting review', failed: 'Processing failed', released: 'Released' };

// One rule for every screen: AI-marked work needs review until the tutor has checked every part.
export const needsReview = (item: QueueItem) => item.status === 'awaiting_review' && !item.review_complete;
// Checked in full but not yet released to the student (UC8).
export const readyToRelease = (item: QueueItem) => item.review_complete && item.status !== 'released';

export function reviewState(item: QueueItem) {
  if (item.status === 'released') return { key: 'released', label: 'Released' };
  // A reopened result stays visible to the student until the tutor releases it again.
  if (item.released_at) return { key: 'in_progress', label: 'Reopened' };
  if (item.review_complete) return { key: 'reviewed', label: 'Ready to release' };
  if (item.status === 'awaiting_review' && item.review_saved_at) return { key: 'in_progress', label: 'Review in progress' };
  return { key: item.status, label: gradingLabels[item.status] };
}
