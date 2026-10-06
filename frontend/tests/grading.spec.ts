import { test, expect, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import bank from './fixtures/questions.json' with { type: 'json' };
import type { ReviewDraft } from '../src/types/grading';

const id = '90000000-0000-4000-8000-000000000001';
const question = bank[0];
const points = question.marking_rubric.parts[0].marking_points.map((point, index) => ({ ...point,
  awarded: index ? 0 : 1, evidence: index ? '' : '(x - 3)(x + 3) = 0',
  rationale: index ? 'The final answer is unclear.' : 'Correct factorisation.', confidence: .7,
}));
const item = { submission_id: id, status: 'awaiting_review', flagged: true, error: null,
  student_code: 'blue-otter', student_name: 'Aisha', class_name: 'Saturday maths', paper_title: 'Algebra practice',
  submitted_at: '2026-09-30T08:00:00Z', review_saved_at: null, version: 2 };
async function mockGrading(page: Page) {
  await mockAuth(page, true);
  const state = { items: [structuredClone(item)], saved: null as ReviewDraft | null, failSave: false, version: 2 };
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c9l8AAAAASUVORK5CYII=';
  await page.route('**/api/v1/grading**', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const path = new URL(route.request().url()).pathname;
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
test('failed grading can be retried and processing has its own filter', async ({ page }) => {
  const state = await mockGrading(page); state.items[0].status = 'failed'; await openQueue(page);
  await page.getByRole('button', { name: /Processing failed/ }).click();
  await expect(page.getByRole('button', { name: 'Review manually' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry grading' }).click();
  await expect(page.getByRole('status')).toContainText('Submission queued');
  await page.getByRole('button', { name: /^Processing [0-9]/ }).click();
  await expect(page.locator('.grading-list')).toContainText('Queued');
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
