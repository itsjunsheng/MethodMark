import { mockAuth } from './helpers/auth';
import { test, expect } from '@playwright/test';
import bankFixture from './fixtures/questions.json' with { type: 'json' };
import { selectPaperScope } from './helpers/paperBuilder';

test.beforeEach(async ({ page }) => { await mockAuth(page, true); });

// Put all content shapes in one scope for renderer regression coverage.
const questions = bankFixture.map(question => ({ ...question, school_year: 3, subject_level: 'G3', difficulty: 'medium' }));

const endpoint = '**/api/v1/sample-paper/questions';

for (const failure of [
  { name: 'empty bank', status: 200, body: [], message: 'Your question bank is empty.' },
  { name: 'backend failure', status: 503, body: { detail: 'The question bank is not connected.' }, message: 'The question bank is not connected.' },
]) {
  test(`${failure.name} stays in builder and allows retry`, async ({ page }) => {
    let failing = true;
    await page.route(endpoint, route => route.fulfill({
      status: failing ? failure.status : 200, json: failing ? failure.body : questions,
    }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(failure.message);
    await expect(page.locator('.question-card')).toHaveCount(0);
    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await selectPaperScope(page);
    await page.getByLabel('Paper title').fill('Retry paper');
    await page.getByRole('button', { name: 'Generate sample paper' }).click();
    await expect(page.locator('.question-card')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Retry paper' })).toBeVisible();
  });
}

test('loads bank options and generates matching questions with parts, diagrams and editable snapshots', async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(endpoint, async route => {
    requests += 1;
    await ready;
    await route.fulfill({ json: questions });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await expect(page.getByText('Loading question options...', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate sample paper' })).toBeDisabled();
  release();
  await selectPaperScope(page);
  const loadedRequests = requests;
  await page.getByLabel('Paper title').fill('Live bank sample');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  const cards = page.locator('.question-card');
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Practice paper cover' })).toBeVisible();
  await expect(page.locator('.exam-answer-line')).toHaveCount(6);
  await expect(page.locator('.exam-document .question-level')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
  await expect(page.locator('.paper-modal .paper-toolbar')).toContainText('12 marks');
  await expect(cards.nth(0)).toContainText('Solve x');
  await expect(cards.nth(1)).toContainText('Find y when x = 4.');
  await expect(cards.nth(1)).toContainText('Find x when y = 20.');
  await expect(cards.nth(3)).toContainText('Solve 3x + 7 = 22.');
  await expect(cards.nth(4)).toContainText('Find 20% of 80.');
  const diagram = page.getByRole('img', { name: 'Triangle ABC with AB vertical, BC horizontal, and a right angle at B.' });
  await expect(diagram).toBeVisible();
  expect(await diagram.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.solution-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show solutions & rubric' }).click();
  await expect(page.locator('.solution-box')).toHaveCount(5);
  await expect(page.locator('.marking-points li')).toHaveCount(12);
  await expect(page.locator('.exam-marking-question').nth(1)).toContainText('Correctly substitutes x = 4.');
  await expect(page.locator('.exam-marking-question').nth(2)).toContainText('AC = 5 cm');
  await page.getByLabel('I have reviewed every question').check();
  await page.getByRole('button', { name: 'Edit paper' }).click();
  await cards.nth(1).getByRole('textbox', { name: 'Question text', exact: true }).nth(1).fill('Find y when x = 5.');
  await cards.nth(1).getByRole('textbox', { name: 'Solution (a)', exact: true }).fill('y = 3(5) + 2\ny = 17');
  await expect(page.getByLabel('I have reviewed every question')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Replace with another sample' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Live bank sample' }) }).click();
  await expect(page.locator('.question-card').nth(1)).toContainText('Find y when x = 5.');
  await expect(diagram).toBeVisible();
  expect(requests).toBe(loadedRequests);
});

test('closing a pending request does not create a paper later', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(endpoint, async route => {
    await ready;
    await route.fulfill({ json: questions }).catch(() => {});
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await expect(page.getByText('Loading question options...', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate sample paper' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
});
