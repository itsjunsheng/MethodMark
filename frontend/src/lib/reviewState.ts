import type { QueueItem } from '../types/grading';

export const gradingLabels = { queued: 'Queued', processing: 'Processing', awaiting_review: 'Awaiting review', failed: 'Processing failed' };

// One rule for every screen: AI-marked work needs review until the tutor has checked every part.
export const needsReview = (item: QueueItem) => item.status === 'awaiting_review' && !item.review_complete;

export function reviewState(item: QueueItem) {
  if (item.review_complete) return { key: 'reviewed', label: 'Reviewed' };
  if (item.status === 'awaiting_review' && item.review_saved_at) return { key: 'in_progress', label: 'Review in progress' };
  return { key: item.status, label: gradingLabels[item.status] };
}
