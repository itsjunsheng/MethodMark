import { expect, test, type Page } from '@playwright/test';
import { openStudentPaper } from './helpers/handwriting';
import type { StudentResultState } from '../src/types/assignments';

const released: StudentResultState = {
  status: 'released', submitted_at: '2026-10-08T01:00:00Z', released_at: '2026-10-09T02:00:00Z',
  result: {
    earned: 5, available: 8, method: { earned: 4, available: 4 }, accuracy: { earned: 1, available: 4 },
    questions: [
      { number: 1, earned: 1, available: 2, parts: [{ label: null, earned: 1, available: 2,
        marks: [{ code: 'M1', awarded: 1, max_marks: 1 }, { code: 'A1', awarded: 0, max_marks: 1 }],
        feedback: 'Correct factorisation. Give both roots, x = 3 and x = -3.' }] },
      { number: 2, earned: 4, available: 6, parts: [
        { label: '(a)', earned: 2, available: 3, marks: [{ code: 'M2', awarded: 2, max_marks: 2 }, { code: 'A1', awarded: 0, max_marks: 1 }], feedback: '' },
        { label: '(b)', earned: 2, available: 3, marks: [{ code: 'M1', awarded: 1, max_marks: 1 }, { code: 'A1', awarded: 1, max_marks: 1 }, { code: 'B1', awarded: 0, max_marks: 1 }],
          feedback: 'Simplify 8/4 to 2, not 4.' },
      ] },
    ],
  },
};

// A student who has already submitted reopens the link; the result endpoint answers per state.
async function mockSubmittedStudent(page: Page, results: (StudentResultState | 'error')[]) {
  const calls: string[] = [];
  await page.route('**/api/v1/student/assignments/**', route => {
    const request = route.request(), action = new URL(request.url()).pathname.split('/')[6];
    const meta = { id: 'assignment', title: 'Quadratics practice', class_name: 'Saturday maths',
      due_at: '2026-10-07T15:59:00Z', duration: 45, question_count: 2, accepting_submissions: false };
    if (request.method() === 'GET') return route.fulfill({ json: meta });
    if (action === 'result') {
      calls.push(request.postDataJSON().student_code);
      const next = results.length > 1 ? results.shift()! : results[0];
      return next === 'error' ? route.fulfill({ status: 503, json: { detail: 'Assignment storage is unavailable. Try again.' } })
        : route.fulfill({ json: next });
    }
    return route.fulfill({ json: { assignment: meta, student_code: request.postDataJSON().student_code,
      submitted_at: '2026-10-08T01:00:00Z', paper: { id: 'paper', title: meta.title, subject: 'Mathematics', school_year: 3,
        subject_level: 'G3', duration: 45, instructions: 'Show your working.', questions: [] } } });
  });
  return calls;
}

test('a submitted student sees a pending status, then only the released marks and feedback', async ({ page }) => {
  const calls = await mockSubmittedStudent(page, [{ status: 'pending', submitted_at: '2026-10-08T01:00:00Z' }, released]);
  await openStudentPaper(page);
  await expect(page.getByRole('heading', { name: 'Your work has been submitted.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your tutor is reviewing your work' })).toBeVisible();
  await expect(page.getByText('Your result', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check again' }).click();
  const result = page.getByRole('region', { name: 'Your result' });
  await expect(result.locator('.student-result-score')).toHaveText('5 / 863%');
  await expect(result).toContainText('Method marks4 / 4');
  await expect(result).toContainText('Accuracy marks1 / 4');
  await expect(result.getByRole('heading', { level: 3 }).first()).toHaveText('Question 11 / 2');
  await expect(result.getByRole('list', { name: 'Marks for question 2 part (b)' }).getByRole('listitem')).toHaveText(['M1 1 / 1', 'A1 1 / 1', 'B1 0 / 1']);
  await expect(result).toContainText('Simplify 8/4 to 2, not 4.');
  await expect(result).toContainText('Released by your tutor');
  expect(calls).toEqual(['blue-otter', 'blue-otter']);
});

test('a failed result load shows no partial data and can be retried', async ({ page }) => {
  await mockSubmittedStudent(page, ['error', released]);
  await openStudentPaper(page);
  await expect(page.getByText('Your result could not be loaded.')).toBeVisible();
  await expect(page.locator('.student-result-score')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.locator('.student-result-score')).toHaveText('5 / 863%');
});

test('the released result fits a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSubmittedStudent(page, [released]);
  await openStudentPaper(page);
  await expect(page.getByRole('region', { name: 'Your result' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/student-result-390.png', fullPage: true });
});
