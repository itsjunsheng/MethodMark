import { mockStudentPaper, setupAssignmentSchool } from './helpers/assignments';
import { mockAuth } from './helpers/auth';
import { mockClasses } from './helpers/classes';
import { test, expect } from '@playwright/test';
import { drawStroke } from './helpers/handwriting';
import bankFixture from './fixtures/questions.json' with { type: 'json' };
import { selectPaperScope } from './helpers/paperBuilder';

test.beforeEach(async ({ page }) => { await mockAuth(page, true); await mockClasses(page); });

// Exercise every paper content shape within one selected scope.
const questions = bankFixture.map(question => ({ ...question, school_year: 3, subject_level: 'G3', difficulty: 'medium' }));

test('overview renders without browser errors and navigation works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  for (const name of ['Practice papers', 'Assignments', 'Marking queue', 'Classes & students', 'Insights']) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await page.locator('.sidebar .profile').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a paper must be reviewed before it can be published and persists after reload', async ({ page }) => {
  await setupAssignmentSchool(page);
  await page.route('**/api/v1/sample-paper/questions', route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByLabel('Paper title').fill('Weekly algebra checkpoint');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Weekly algebra checkpoint' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publish assignment' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Show solutions & rubric' }).click();
  await expect(dialog.getByText('Worked solution', { exact: true })).toHaveCount(5);
  await dialog.getByLabel('I have reviewed every question').check();
  await dialog.getByRole('button', { name: 'Publish assignment' }).click();
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('checkbox', { name: /Saturday maths/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish assignment' }).click();
  await page.getByRole('button', { name: 'Weekly algebra checkpoint', exact: true }).click();
  await expect(page.getByLabel('Student access link')).toHaveValue(/assignment=[a-f0-9-]{36}/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weekly algebra checkpoint', exact: true })).toBeVisible();
});


test('report export downloads', async ({ page }) => {
  await page.goto('/');
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
  await page.locator('.sidebar').getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice papers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('published student paper matches the tutor preview and is read only for tutors', async ({ page }) => {
  await setupAssignmentSchool(page);
  await page.route('**/api/v1/sample-paper/questions', route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByLabel('Paper title').fill('Published mathematics paper');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await expect(page.locator('.exam-question')).toHaveCount(5);
  await expect(page.locator('.exam-sheet')).toHaveCount(3);
  const tutorPaper = await page.locator('.exam-document').innerHTML();
  const tutorPageSizes = await page.locator('.exam-sheet').evaluateAll(sheets => sheets.map(sheet => ({
    width: Math.round(sheet.getBoundingClientRect().width), height: Math.round(sheet.getBoundingClientRect().height),
  })));

  await page.getByLabel('I have reviewed every question').check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('checkbox', { name: /Saturday maths/ }).check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await page.getByRole('button', { name: 'Published mathematics paper', exact: true }).click();
  const studentUrl = await page.getByLabel('Student access link').inputValue();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Published mathematics paper' }) }).click();
  await expect(page.getByRole('button', { name: 'Edit paper', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign to classes' })).toBeEnabled();

  await page.goto(studentUrl);
  await page.getByLabel('Your student code').fill('blue-otter');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  // Only the optional writing layer differs; all source paper markup stays identical.
  await expect.poll(() => page.locator('.exam-document').evaluate(element => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.handwriting-area').forEach(area => area.remove());
    return copy.innerHTML;
  })).toBe(tutorPaper);
  expect(await page.locator('.exam-sheet').evaluateAll(sheets => sheets.map(sheet => ({
    width: Math.round(sheet.getBoundingClientRect().width), height: Math.round(sheet.getBoundingClientRect().height),
  })))).toEqual(tutorPageSizes);
  await expect(page.locator('.exam-document')).not.toContainText('New unpublished revision');
  await expect(page.locator('.exam-document')).not.toContainText('This question is only in the new revision.');
  await expect(page.getByRole('button', { name: 'Show solutions & rubric' })).toHaveCount(0);
  await expect(page.locator('.solution-box')).toHaveCount(0);
  await expect(page.locator('.exam-document textarea, .exam-document input')).toHaveCount(0);
  await expect(page.locator('.handwriting-area')).toHaveCount(6);
  await expect(page.getByRole('img', { name: 'Writing space for question 5', exact: true })).toBeVisible();
  await page.getByText('Wrote on paper? Attach photos instead', { exact: true }).click();
  await expect(page.getByLabel('Upload handwritten solutions')).toBeVisible();

  const partA = page.getByRole('img', { name: 'Writing space for question 2 (a)', exact: true });
  const partB = page.getByRole('img', { name: 'Writing space for question 2 (b)', exact: true });
  await drawStroke(page, partA);
  await drawStroke(page, partB, 10);
  const pathA = await partA.locator('path').getAttribute('d');
  const pathB = await partB.locator('path').getAttribute('d');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.student-submission')).toBeHidden();
  await expect(page.locator('.student-exam-toolbar')).toBeHidden();
  await expect(page.locator('.paper-toolbar-group')).toBeHidden();
  await expect(partA.locator('path')).toHaveAttribute('d', pathA!);
  await expect(partB.locator('path')).toHaveAttribute('d', pathB!);
  await expect(page.locator('.exam-cover')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.exam-question')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(partA.locator('path')).toHaveAttribute('d', pathA!);
  await expect(partB.locator('path')).toHaveAttribute('d', pathB!);
  await expect(page.getByRole('button', { name: 'Submit work' })).toBeEnabled();
});


for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
  test(`scrolling over the student paper moves the page at ${viewport.width}px`, async ({ page }) => {
    await mockStudentPaper(page);
    await page.setViewportSize(viewport);
    await page.goto('/?assignment=30000000-0000-4000-8000-000000000001');
    await page.getByLabel('Your student code').fill('blue-otter');
    await page.getByRole('button', { name: 'Open practice paper' }).click();
    await expect(page.locator('.exam-cover')).toBeVisible();

    const initialScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll + 100);
    await page.mouse.wheel(0, -600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(initialScroll + 1);
    await page.mouse.wheel(0, 1200);
    await expect(page.locator('.exam-question').first()).toBeInViewport();
  });
}
