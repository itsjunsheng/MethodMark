import { test, expect } from '@playwright/test';
import questions from './fixtures/questions.json' with { type: 'json' };

test('overview renders without browser errors and navigation works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  for (const name of ['Practice papers', 'Assignments', 'Marking queue', 'Classes & students', 'Insights', 'Settings']) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('a paper must be reviewed before it can be published and persists after reload', async ({ page }) => {
  await page.route('**/api/v1/sample-paper/questions', route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await page.getByLabel('Paper title').fill('Weekly algebra checkpoint');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Weekly algebra checkpoint' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publish assignment' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Show solutions & rubric' }).click();
  await expect(dialog.getByText('Worked solution', { exact: true })).toHaveCount(5);
  await dialog.getByLabel('I have reviewed every question').check();
  await dialog.getByRole('button', { name: 'Publish assignment' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish assignment' }).click();
  await expect(page.getByLabel('Student access link')).toHaveValue(/assignment=MM-/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Weekly algebra checkpoint', exact: true })).toBeVisible();
});

test('review requires every question, validates marks, saves draft, and confirms release', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s review' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Approve & release' })).toBeDisabled();
  await page.getByLabel('Accuracy marks').fill('4');
  await page.getByLabel('I’ve checked the working').check();
  await expect(page.getByRole('button', { name: 'Approve & release' })).toBeDisabled();
  await page.getByLabel('Accuracy marks').fill('1');
  await page.getByLabel('I’ve checked the working').check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await expect(page.getByLabel('I’ve checked the working')).toBeChecked();
  for (let i = 2; i <= 4; i++) {
    await page.getByRole('button', { name: `Question ${i}`, exact: true }).click();
    await page.getByLabel('I’ve checked the working').check();
  }
  await page.getByRole('button', { name: 'Approve & release' }).click();
  await expect(page.getByText('Release 12/12 to Chloe Tan?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm release' }).click();
  await page.locator('.tabs').getByRole('button', { name: /Released/ }).click();
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.nav-count')).toHaveText('7');
});

test('assignment and student filters narrow results and report export downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await page.getByLabel('Filter by class').selectOption('Sec 4 · E-Math');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByPlaceholder('Search assignments…').fill('no matching paper');
  await expect(page.getByText('No assignments here yet')).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByPlaceholder('Search by name or student code…').fill('S301');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'CT Chloe Tan' }).click();
  await expect(page.getByRole('heading', { name: 'Learning focus' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Insights', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('methodmark-sample-performance.csv');
});

test('mobile dashboard has no horizontal overflow and menu is usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice papers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('student preview validates class codes and accepts complete sample answers', async ({ page }) => {
  await page.goto('/?assignment=MM-QF26');
  await page.getByLabel('Your student code').fill('S999');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByText('That code does not belong to this class.')).toBeVisible();
  await page.getByLabel('Your student code').fill('S301');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('button', { name: 'Submit sample work' })).toBeDisabled();
  for (let i = 1; i <= 4; i++) await page.getByLabel(`Answer to question ${i}`).fill('My sample working and answer.');
  await page.getByRole('button', { name: 'Submit sample work' }).click();
  await expect(page.getByRole('heading', { name: 'One more step forward.' })).toBeVisible();
});
