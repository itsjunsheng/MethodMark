import { test, expect, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { setupAssignmentSchool } from './helpers/assignments';
import { selectPaperScope } from './helpers/paperBuilder';
import { drawStroke } from './helpers/handwriting';
import questions from './fixtures/questions.json' with { type: 'json' };

test.beforeEach(async ({ page }) => { await mockAuth(page, true); });

async function generate(page: Page, title = 'Weekly algebra') {
  await page.route('**/api/v1/sample-paper/questions', route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByLabel('Paper title').fill(title);
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await page.getByLabel('I have reviewed every question').check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
}
async function publish(page: Page, both = false) {
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('checkbox', { name: /Saturday maths/ }).check();
  if (both) await page.getByRole('checkbox', { name: /Sunday maths/ }).check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
}

test('empty database has no fake papers or assignments', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No assignments yet' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Released', exact: true })).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
});

test('publish to multiple classes, see per-class assignments and missing submissions', async ({ page }) => {
  const { db, school } = await setupAssignmentSchool(page);
  await generate(page);
  await expect(page.getByRole('button', { name: 'Publish assignment', exact: true })).toBeDisabled();
  await page.getByRole('dialog').screenshot({ path: 'test-results/publish-classes.png', animations: 'disabled' });
  await publish(page, true);
  await expect(page.locator('.live-assignment-table tbody tr')).toHaveCount(2);
  expect(db.papers).toHaveLength(1);
  expect(db.assignments).toHaveLength(2);
  expect(new Set(db.assignments.map(a => a.share_token)).size).toBe(2);
  await page.getByLabel('Filter assignments by class').selectOption(school.classes[0].id);
  await expect(page.locator('.live-assignment-table tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('0 / 2');
  await page.getByRole('button', { name: 'Weekly algebra', exact: true }).click();
  await expect(page.getByLabel('Student access link')).toHaveValue(/assignment=[a-f0-9-]{36}/);
  await page.getByLabel('Filter student submissions').selectOption('Not submitted');
  await expect(page.locator('.assignment-student-list li')).toHaveCount(2);
  await expect(page.locator('.assignment-student-list')).toContainText('Aisha');
  await expect(page.locator('.assignment-student-list')).toContainText('red-fox');
  await page.getByRole('dialog').screenshot({ path: 'test-results/assignment-roster.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Saturday maths', exact: true }) }).click();
  await expect(page.getByRole('region', { name: 'Class assignments' })).toContainText('Weekly algebra');
  await expect(page.locator('.live-assignment-table tbody tr')).toHaveCount(1);
});

test('student submission updates counts, missing list and tutor work preview', async ({ page }) => {
  const { db } = await setupAssignmentSchool(page);
  await generate(page);
  await publish(page);
  await page.goto('/?assignment=' + db.assignments[0].share_token);
  await page.getByLabel('Your student code').fill('wrong-code');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('alert')).toContainText('Check your student code');
  await page.getByLabel('Your student code').fill(' BLUE-OTTER ');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('button', { name: 'Submit work', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await drawStroke(page, page.getByRole('img', { name: 'Writing space for question 1', exact: true }));
  const draftKey = 'methodmark:handwriting:v1:' + db.assignments[0].id + ':' + db.papers[0].id + ':blue-otter';
  const otherDraftKey = draftKey.replace('blue-otter', 'red-fox');
  await page.evaluate(key => localStorage.setItem(key, '{}'), otherDraftKey);
  db.failSubmit = true;
  await page.getByRole('button', { name: 'Submit work', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save your work');
  await expect(page.getByRole('heading', { name: 'Your work has been submitted.' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).not.toBeNull();
  db.failSubmit = false;
  await page.getByRole('button', { name: 'Submit work', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your work has been submitted.' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(db.submissions).toHaveLength(1);
  expect(Object.keys(db.submissions[0].drawing)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'View paper' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Published practice paper' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), otherDraftKey)).toBe('{}');
  await page.reload();
  await page.getByLabel('Your student code').fill('blue-otter');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('heading', { name: 'Your work has been submitted.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View paper' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Published practice paper' })).toHaveCount(0);
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('1 / 2');
  await page.getByRole('button', { name: 'Weekly algebra', exact: true }).click();
  await page.getByLabel('Filter student submissions').selectOption('Not submitted');
  await expect(page.locator('.assignment-student-list li')).toHaveCount(1);
  await expect(page.locator('.assignment-student-list')).toContainText('red-fox');
  await page.getByLabel('Filter student submissions').selectOption('Submitted');
  await expect(page.locator('.assignment-student-list')).toContainText('Aisha');
  await page.getByRole('button', { name: 'View work' }).click();
  await expect(page.locator('.handwriting-area path')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveCount(0);
});

test('due date changes status and closes student submissions', async ({ page }) => {
  const { db } = await setupAssignmentSchool(page);
  await generate(page);
  await publish(page);
  db.assignments[0].due_at = new Date(Date.now() - 60000).toISOString();
  await page.getByRole('button', { name: 'Refresh assignments', exact: true }).click();
  await page.getByLabel('Filter assignments by status').selectOption('Ready for grading');
  await expect(page.locator('.assignment-status')).toHaveText('Ready for grading');
  await page.getByLabel('Filter assignments by status').selectOption('Published');
  await expect(page.getByRole('heading', { name: 'No matching assignments' })).toBeVisible();
  await page.goto('/?assignment=' + db.assignments[0].share_token);
  await expect(page.getByText('Submissions are closed.', { exact: false })).toBeVisible();
  await page.getByLabel('Your student code').fill('blue-otter');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('heading', { name: 'Submissions are closed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit work', exact: true })).toHaveCount(0);
});

test('publication errors preserve selection and allow retry', async ({ page }) => {
  const { db } = await setupAssignmentSchool(page);
  await generate(page);
  db.failPublish = true;
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('checkbox', { name: /Saturday maths/ }).check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await expect(page.getByRole('checkbox', { name: /Saturday maths/ })).toBeChecked();
  expect(db.assignments).toHaveLength(0);
  db.failPublish = false;
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await expect(page.locator('.live-assignment-table tbody tr')).toHaveCount(1);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.locator('.live-assignment-table tbody tr')).toHaveCount(1);
});

for (const width of [390, 768]) {
  test('assignments remain usable at ' + width + 'px', async ({ page }) => {
    await setupAssignmentSchool(page);
    await page.setViewportSize({ width, height: 1000 });
    await generate(page);
    await publish(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Weekly algebra', exact: true }).click();
    await expect(page.getByLabel('Student access link')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/assignments-' + width + '.png', animations: 'disabled' });
  });
}

test('removing a student blocks their code but keeps submitted work for the tutor', async ({ page }) => {
  const { db, school } = await setupAssignmentSchool(page);
  await generate(page);
  await publish(page);
  db.submissions.push({
    id: '60000000-0000-4000-8000-000000000001', assignment_id: db.assignments[0].id,
    student_id: school.students[0].id, student_code: school.students[0].student_code,
    submitted_at: new Date().toISOString(), drawing: {}, attachments: [], students: { name: 'Aisha' },
  });
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Saturday maths', exact: true }) }).click();
  await page.getByRole('button', { name: 'Remove blue-otter from class', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove from class', exact: true }).click();
  await expect(page.locator('.live-assignment-table tbody')).toContainText('0 / 1');
  await page.getByRole('button', { name: 'Weekly algebra', exact: true }).click();
  await page.getByLabel('Filter student submissions').selectOption('Submitted');
  await expect(page.locator('.assignment-student-list li')).toHaveCount(1);
  await expect(page.locator('.assignment-student-list')).toContainText('Aisha');
  await expect(page.locator('.assignment-student-list')).toContainText('Former class member');
  await page.getByRole('button', { name: 'View work' }).click();
  await expect(page.getByRole('dialog', { name: 'Aisha' })).toBeVisible();
  await page.goto('/?assignment=' + db.assignments[0].share_token);
  await page.getByLabel('Your student code').fill('blue-otter');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.getByRole('alert')).toContainText('Check your student code');
  expect(db.submissions).toHaveLength(1);
});

test('class dropdown keeps assigned classes locked and supports keyboard dismissal', async ({ page }) => {
  await setupAssignmentSchool(page);
  await generate(page);
  await publish(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Weekly algebra' }) }).click();
  await page.getByRole('button', { name: 'Assign to classes', exact: true }).click();
  const picker = page.getByRole('button', { name: /^Assign to classes/ });
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.focus();
  await picker.press('Space');
  await expect(page.getByRole('checkbox', { name: /Saturday maths/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Saturday maths/ })).toBeDisabled();
  const sunday = page.getByRole('checkbox', { name: /Sunday maths/ });
  await sunday.check();
  await sunday.press('Escape');
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(picker).toContainText('Sunday maths');
  await expect(page.getByRole('dialog', { name: 'Assign to your classes' })).toBeVisible();
  await picker.click();
  await sunday.uncheck();
  await page.getByRole('heading', { name: 'Assign to your classes', exact: true }).click();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Publish assignment', exact: true })).toBeDisabled();
});

for (const viewport of [{ width: 768, height: 620 }, { width: 390, height: 540 }]) {
  test('class menu contains scrolling and whole rows toggle at ' + viewport.width + 'px', async ({ page }) => {
    await page.setViewportSize(viewport);
    const { school } = await setupAssignmentSchool(page);
    school.classes.push(...Array.from({ length: 18 }, (_, i) => ({
      ...school.classes[0], id: 'extra-class-' + i, name: 'Mathematics class ' + (i + 1),
    })));
    await generate(page);
    const dialog = page.getByRole('dialog', { name: 'Assign to your classes' });
    const picker = page.getByRole('button', { name: /^Assign to classes/ });
    const before = await dialog.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, top: el.scrollTop }));
    await picker.click();
    const menu = page.getByRole('group', { name: 'Available classes' });
    await expect(menu).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, top: el.scrollTop }))).toEqual(before);
    const saturday = page.getByRole('checkbox', { name: /Saturday maths/ });
    const bounds = (await saturday.boundingBox())!;
    await saturday.click({ position: { x: bounds.width - 14, y: bounds.height / 2 } });
    await expect(saturday).toBeChecked();
    await expect(picker).toContainText('Saturday maths');
    await saturday.getByText('Saturday maths', { exact: true }).click();
    await expect(saturday).not.toBeChecked();
    await saturday.press('Space');
    await expect(saturday).toBeChecked();
    await saturday.press('Enter');
    await expect(saturday).not.toBeChecked();
    await menu.hover();
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => menu.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => menu.evaluate(el => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight)).toBe(true);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    expect(await dialog.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, top: el.scrollTop }))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
    await dialog.screenshot({ path: 'test-results/class-menu-contained-' + viewport.width + '.png', animations: 'disabled' });
  });
}
