import { test, expect, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import bank from './fixtures/questions.json' with { type: 'json' };
import type { ReviewDraft } from '../src/types/grading';

const id = '90000000-0000-4000-8000-000000000001';
const classId = '40000000-0000-4000-8000-000000000001';
const question = bank[0];
const points = question.marking_rubric.parts[0].marking_points.map((point, index) => ({ ...point,
  awarded: index ? 0 : 1, evidence: index ? '' : '(x - 3)(x + 3) = 0',
  rationale: index ? 'The final answer is unclear.' : 'Correct factorisation.', confidence: .7,
}));
const item = { submission_id: id, status: 'awaiting_review', flagged: true, error: null as string | null, class_id: classId,
  student_code: 'blue-otter', student_name: 'Aisha', class_name: 'Saturday maths', paper_title: 'Algebra practice',
  submitted_at: '2026-09-30T08:00:00Z', review_saved_at: null, review_complete: false, version: 2 };
async function mockGrading(page: Page) {
  await mockAuth(page, true);
  const state = { items: [structuredClone(item)], saved: null as ReviewDraft | null, failSave: false, failSend: false, sentClasses: [] as string[], version: 2 };
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c9l8AAAAASUVORK5CYII=';
  await page.route('**/api/v1/grading**', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/send')) {
      expect(route.request().method()).toBe('POST');
      if (state.failSend) return route.fulfill({ status: 502, json: { detail: 'Unable to queue this class. Please try again.' } });
      const targetClass = path.split('/').at(-2)!;
      state.sentClasses.push(targetClass);
      const pending = state.items.filter(row => row.class_id === targetClass && row.status === 'submitted');
      pending.forEach(row => { row.status = 'queued'; });
      return route.fulfill({ json: { queued: pending.length } });
    }
    if (path.endsWith('/review')) {
      if (state.failSave) return route.fulfill({ status: 409, json: { detail: 'This assessment changed. Reopen it before saving.' } });
      const payload = route.request().postDataJSON();
      expect(payload.version).toBe(state.version);
      state.saved = payload.draft; state.version++;
      return route.fulfill({ json: { version: state.version, review_saved_at: '2026-10-01T00:00:00Z' } });
    }
    if (path.endsWith('/retry')) {
      state.items[0].status = 'queued'; state.items[0].error = null;
      return route.fulfill({ json: { status: 'queued' } });
    }
    if (path.endsWith(id)) return route.fulfill({ json: {
      job: { submission_id: id, status: 'awaiting_review', version: state.version, review_draft: state.saved,
        vision_model: 'test-model', result: { prompt_version: 'rubric-v1', questions: [{ question_id: question.id, number: 1, parts: [{
          part_id: 'main', label: null, transcription: '(x - 3)(x + 3) = 0', legibility: 'uncertain', confidence: .7,
          flags: ['Handwriting needs checking.'], feedback: 'Check both roots.', points,
        }] }] } },
      submission: { id, student_code: item.student_code, submitted_at: item.submitted_at, attachments: [],
        drawing: { [JSON.stringify([question.id, 'main'])]: [[[.1, .2], [.4, .5], [.7, .2]]] },
        drawing_sizes: { [JSON.stringify([question.id, 'main'])]: [500, 150] },
      },
      photos: [{ name: 'working.png', url: photo }], class_name: item.class_name, manual_error: null,
      paper: { id: 'paper', title: item.paper_title, color: 'sage', is_archived: false, subject: 'Mathematics',
        school_year: 3, subject_level: 'G3', duration_minutes: 45, instructions: 'Show your working.', status: 'published',
        questions_snapshot: [{ id: question.id, topic: 'Algebra', text: 'Solve the equation.', method: 1, accuracy: 1,
          solution: '', bankQuestion: question }], updated_at: item.submitted_at },
    } });
    return route.fulfill({ json: state.items });
  });
  return state;
}
async function openQueue(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Jun\./ })).toBeVisible();
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Marking queue', exact: true }).click();
}
test('empty queue has no sample reviews or release controls', async ({ page }) => {
  await mockAuth(page, true); await openQueue(page);
  await expect(page.getByRole('heading', { name: 'No submissions yet' })).toBeVisible();
  await expect(page.locator('.grading-list li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Released|Approve/ })).toHaveCount(0);
});
test('review original ink and photos and persist a private rubric draft', async ({ page }) => {
  const state = await mockGrading(page); await openQueue(page);
  await expect(page.locator('.grading-list li')).toHaveCount(1);
  await expect(page.locator('.grading-list')).toContainText('Saturday maths');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Original submission' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Submitted photo 1' })).toBeVisible();
  await expect(dialog.locator('.grading-ink svg path')).toHaveCount(1);
  const box = await dialog.locator('.grading-ink').boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(500 / 150, 1);
  await expect(dialog).toContainText('Handwriting needs checking.');
  await expect(dialog).toContainText('Correct factorisation.');
  const mark = dialog.getByLabel('Marks for main ' + points[0].id);
  await mark.fill('99'); await expect(mark).toHaveValue('1'); await mark.fill('0');
  await dialog.getByLabel('Feedback for main').fill('Recheck both roots.');
  await dialog.getByLabel('I have checked this part.').check();
  await dialog.getByRole('button', { name: 'Save review draft' }).click();
  await expect(dialog.getByRole('status')).toContainText('Review draft saved');
  expect(state.saved!.questions[0].parts[0].points[0].awarded).toBe(0);
  expect(state.saved!.questions[0].parts[0].checked).toBe(true);
  await expect(dialog.getByRole('button', { name: /Approve|Release/ })).toHaveCount(0);
  await dialog.screenshot({ path: 'test-results/grading-review-desktop.png' });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Marking queue', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByLabel('Feedback for main')).toHaveValue('Recheck both roots.');
  await expect(page.getByLabel('I have checked this part.')).toBeChecked();
});
test('failed grading appears on the right of its student row and can be retried', async ({ page }) => {
  const state = await mockGrading(page); state.items[0].status = 'failed';
  state.items[0].error = 'The submitted photo could not be processed.';
  await openQueue(page);
  await expect(page.locator('.grading-row-result')).toContainText(state.items[0].error);
  await expect(page.locator('.grading-tabs').getByRole('button', { name: /Processing/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review manually' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry grading' }).click();
  await expect(page.getByRole('status')).toContainText('Submission queued');
  await expect(page.locator('.grading-list')).toContainText('Queued');
  await expect(page.locator('.grading-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
});
test('conflicted save keeps edits and displays a toast', async ({ page }) => {
  const state = await mockGrading(page); state.failSave = true; await openQueue(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel('Feedback for main').fill('Keep this edit.');
  await page.getByRole('button', { name: 'Save review draft' }).click();
  await expect(page.getByRole('alert')).toContainText('This assessment changed.');
  await expect(page.getByLabel('Feedback for main')).toHaveValue('Keep this edit.');
  expect(state.saved).toBeNull();
});
test('all submissions opens first and each class sends only its new work', async ({ page }) => {
  const state = await mockGrading(page);
  state.items[0].status = 'submitted';
  const otherClass = '40000000-0000-4000-8000-000000000002';
  state.items.push(
    { ...item, submission_id: '2', student_name: 'Ben', status: 'submitted', flagged: false },
    { ...item, submission_id: '3', student_name: 'Chen', status: 'submitted', class_id: otherClass, class_name: 'Sunday maths' },
    { ...item, submission_id: '4', student_name: 'Dina', review_complete: true },
    { ...item, submission_id: '5', student_name: 'Ella', status: 'processing' },
    { ...item, submission_id: '6', student_name: 'Farah', status: 'failed', error: 'Photo could not be processed.' },
  );
  await openQueue(page);
  await expect(page.locator('.grading-tabs button').first()).toHaveText('All submissions6');
  await expect(page.locator('.grading-tabs button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Ready for your judgement.')).toHaveCount(0);
  await expect(page.locator('.grading-list li')).toHaveCount(6);
  const send = page.getByRole('button', { name: 'Send for grading', exact: true });
  await expect(send).toHaveCount(1);
  await expect(page.locator('.grading-class-heading')).toHaveCount(0);
  await expect(page.locator('.grading-list')).toHaveCount(1);
  const refreshBox = await page.getByRole('button', { name: 'Refresh', exact: true }).boundingBox();
  const sendBox = await send.boundingBox();
  expect(sendBox!.y).toBeCloseTo(refreshBox!.y, 0);
  expect(sendBox!.x).toBeGreaterThan(refreshBox!.x + refreshBox!.width);
  await send.click();
  await expect(page.getByRole('status')).toHaveText('Please select a class before sending submissions for grading.');
  expect(state.sentClasses).toEqual([]);
  expect(state.items[0].status).toBe('submitted');
  await page.getByLabel('Filter by class').selectOption(classId);
  await expect(page.locator('.grading-list li')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'All submissions 5', exact: true })).toBeVisible();
  // Search narrows the display; the class action still sends all of that class's new work.
  await page.getByLabel('Search marking queue').fill('Aisha');
  await expect(page.locator('.grading-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 submissions queued for grading.');
  await expect(page.locator('.grading-list')).toContainText('Queued');
  await expect(page.getByRole('button', { name: 'Send for grading', exact: true })).toBeDisabled();
  expect(state.sentClasses).toEqual([classId]);
  expect(state.items.map(row => row.status)).toEqual(['queued', 'queued', 'submitted', 'awaiting_review', 'processing', 'failed']);
  await page.getByLabel('Search marking queue').clear();
  await page.getByLabel('Filter by class').selectOption(otherClass);
  await expect(page.locator('.grading-list li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Send for grading', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 submission queued for grading.');
  expect(state.sentClasses).toEqual([classId, otherClass]);
  await page.getByLabel('Filter by class').selectOption('');
  await expect(page.locator('.grading-list li')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/marking-queue-classes-desktop.png', fullPage: true });
});

test('class send failures keep work unsent and allow another attempt', async ({ page }) => {
  const state = await mockGrading(page);
  state.items[0].status = 'submitted'; state.failSend = true;
  await openQueue(page);
  await page.getByLabel('Filter by class').selectOption(classId);
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to queue this class. Please try again.');
  await expect(page.locator('.grading-list')).toContainText('Not yet sent for grading');
  await expect(page.getByRole('button', { name: 'Send for grading', exact: true })).toBeEnabled();
  state.failSend = false;
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.locator('.grading-list')).toContainText('Queued');
});

for (const width of [390, 768]) test('class queue is usable at ' + width + 'px', async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await mockGrading(page);
  state.items[0].status = 'submitted';
  await openQueue(page);
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Please select a class before sending submissions for grading.');
  expect(state.sentClasses).toEqual([]);
  await page.getByLabel('Filter by class').selectOption(classId);
  await page.getByRole('button', { name: 'Send for grading', exact: true }).click();
  await expect(page.locator('.grading-list')).toContainText('Queued');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: `test-results/marking-queue-classes-${width}.png`, fullPage: true });
});

for (const width of [390, 768]) test('review is usable at ' + width + 'px', async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await mockGrading(page); await openQueue(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Rubric & review' })).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await page.getByLabel('Feedback for main').fill('Good progress.');
  await page.getByRole('button', { name: 'Save review draft' }).click();
  await expect(page.getByRole('status')).toContainText('Review draft saved');
  await dialog.screenshot({ path: 'test-results/grading-review-' + width + '.png' });
});

test('every screen agrees on what still needs review', async ({ page }) => {
  await mockAuth(page, true);
  const row = (submission_id: string, student_name: string, extra = {}) => ({ ...item, submission_id, student_name, flagged: false, review_complete: false, ...extra });
  await page.route('**/api/v1/grading**', route => route.fulfill({ json: [
    row('1', 'Aisha', { flagged: true }),
    row('2', 'Ben', { review_saved_at: '2026-10-01T00:00:00Z' }),
    row('3', 'Chen', { flagged: true, review_saved_at: '2026-10-01T00:00:00Z', review_complete: true }),
  ] }));
  await openQueue(page);
  // A half-finished review still needs work; a finished one does not, wherever it is counted.
  await expect(page.locator('.nav-count')).toHaveText('2');
  for (const [tab, count] of [['Awaiting review', 2], ['Flagged', 1], ['Reviewed', 1], ['All submissions', 3]] as const)
    await expect(page.getByRole('button', { name: `${tab} ${count}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Awaiting review 2', exact: true }).click();
  const list = page.locator('.grading-list');
  await expect(list.locator('li', { hasText: 'Aisha' })).toContainText('Awaiting review');
  await expect(list.locator('li', { hasText: 'Ben' })).toContainText('Review in progress');
  await expect(list.locator('li', { hasText: 'Chen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reviewed 1', exact: true }).click();
  await expect(list.locator('li', { hasText: 'Chen' })).toContainText('Reviewed');
  await expect(list.locator('li', { hasText: 'Chen' })).not.toContainText('Needs a closer look');
  await page.locator('.sidebar').getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.stat-card', { hasText: 'Awaiting review' }).locator('.stat-number')).toHaveText('2');
});
