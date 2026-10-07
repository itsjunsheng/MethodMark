import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { setupAssignmentSchool } from './helpers/assignments';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const item = (id: string, status: string, extra = {}) => ({ submission_id: id, status, flagged: false, error: null, student_code: 'blue-otter',
  student_name: 'Aisha', class_name: 'Saturday maths', paper_title: 'Algebra checkpoint', submitted_at: minutesAgo(30),
  updated_at: minutesAgo(5), review_saved_at: null, version: 2, ...extra });

test('the bell shows unread work, links to it and remembers what was read', async ({ page }) => {
  await mockAuth(page, true);
  const { school, db } = await setupAssignmentSchool(page);
  db.assignments.push({ id: 'due-1', share_token: 'token-1', class_id: school.classes[0].id, paper_id: 'paper-1', class_name: 'Saturday maths',
    title: 'Ratio checkpoint', subject: 'Mathematics', school_year: 3, subject_level: 'G3', question_count: 3, duration_minutes: 30,
    status: 'published', due_at: minutesAgo(60), published_at: minutesAgo(5000), created_at: minutesAgo(5000), submitted_count: 0, student_count: 0 });
  await page.route('**/api/v1/grading', route => route.fulfill({ json: [
    item('a', 'awaiting_review', { flagged: true }),
    item('b', 'failed', { student_name: null, student_code: 'red-fox', error: 'The grading provider is unavailable. Please retry.' }),
    item('c', 'processing', { student_name: 'Ben', submitted_at: minutesAgo(2) }),
    item('d', 'awaiting_review', { student_name: 'Chen', review_saved_at: minutesAgo(1) }),
  ] }));
  await page.goto('/');
  const bell = page.locator('.sidebar').getByRole('button', { name: 'Notifications, 4 unread' });
  await expect(bell).toBeVisible();
  await expect(page.locator('.notification-btn i')).toBeVisible();
  await bell.click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog.getByText('4 new since you last checked.')).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(5); // Four notices and the close button.
  await expect(dialog.getByText('Ben submitted Algebra checkpoint')).toBeVisible();
  await expect(dialog.getByText('Aisha’s work is ready for review')).toBeVisible();
  await expect(dialog.getByText('Flagged for a closer look', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Ratio checkpoint is ready for grading')).toBeVisible();
  await expect(dialog.getByText('Chen’s work is ready for review')).toHaveCount(0); // Already reviewed.
  await dialog.getByRole('button', { name: /Grading failed for red-fox/ }).click();
  await expect(page.getByRole('heading', { name: 'Marking queue', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.locator('.notification-btn i')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText('You’re up to date.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Ratio checkpoint is ready for grading/ }).click();
  await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
});

test('an empty workspace has no unread dot and explains what will appear', async ({ page }) => {
  await mockAuth(page, true);
  await page.goto('/');
  await expect(page.locator('.notification-btn i')).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText('Nothing yet. New submissions, grading results and deadlines will appear here.')).toBeVisible();
});
