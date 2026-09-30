import { test, expect, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { mockAssignments, mockStudentPaper, setupAssignmentSchool } from './helpers/assignments';
import { mockClasses } from './helpers/classes';
import { selectPaperScope } from './helpers/paperBuilder';
import { openStudentPaper } from './helpers/handwriting';
import { colours } from '../src/lib/colours';
import questions from './fixtures/questions.json' with { type: 'json' };

async function papers(page: Page) {
  await expect(page.locator('.app-shell')).toBeVisible();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.locator('.sidebar').getByRole('button', { name: 'Practice papers', exact: true }).click();
}
async function createPaper(page: Page) {
  await papers(page);
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByLabel('Paper title').fill('Weekly maths practice');
  await page.getByRole('button', { name: 'Generate sample paper', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your practice paper' })).toBeVisible();
}
async function changeColour(page: Page, current: string | undefined) {
  const colour = colours.find(option => option.value !== current)!;
  await page.getByRole('button', { name: colour.label, exact: true }).click();
  await expect(page.locator('.item-menu')).toHaveCount(0);
  return colour;
}
async function paperMenu(page: Page) {
  await page.getByRole('button', { name: 'Options for Weekly maths practice', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page, true);
  await page.route('**/api/v1/sample-paper/questions', route => route.fulfill({ json: questions }));
});

test('papers get a stored colour and changing it preserves content and review status', async ({ page }) => {
  const db = await mockAssignments(page);
  await page.goto('/');
  await createPaper(page);
  await page.getByRole('checkbox', { name: 'I have reviewed every question, solution, and marking rubric.' }).check();
  await page.getByRole('button', { name: 'Save reviewed paper' }).click();
  await expect(page.getByRole('status')).toContainText('Paper and rubric saved.');
  const snapshot = structuredClone(db.papers[0].questions_snapshot);
  expect(colours.some(colour => colour.value === db.papers[0].color)).toBe(true);
  const original = db.papers[0].color;
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const card = page.locator('.paper-card');
  await expect(card.locator('.paper-symbol, .paper-cover')).toHaveCount(0);
  await card.getByRole('button', { name: 'Options for Weekly maths practice' }).click();
  const choice = await changeColour(page, original);
  expect(db.papers[0].color).toBe(choice.value);
  expect(db.papers[0].status).toBe('reviewed');
  expect(db.papers[0].questions_snapshot).toEqual(snapshot);
  await page.reload(); await papers(page);
  await expect(card).toHaveCSS('--item-colour', choice.accent);
  await card.getByRole('button', { name: 'Options for Weekly maths practice' }).click();
  await expect(page.getByRole('button', { name: choice.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('paper deletion supports cancel, failure, retry and stays deleted after reload', async ({ page }) => {
  const db = await mockAssignments(page);
  await page.goto('/'); await createPaper(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await paperMenu(page);
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(db.papers).toHaveLength(1);
  await paperMenu(page);
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  db.failSave = true;
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  expect(db.papers).toHaveLength(1);
  db.failSave = false;
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(db.papers).toHaveLength(0);
  await page.reload(); await papers(page);
  await expect(page.locator('.paper-card')).toHaveCount(0);
});

test('archiving preserves published assignments and restoring preserves status; deleting removes dependent records', async ({ page }) => {
  const { db, school } = await setupAssignmentSchool(page);
  await page.goto('/'); await createPaper(page);
  await page.getByRole('checkbox', { name: 'I have reviewed every question, solution, and marking rubric.' }).check();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('checkbox', { name: /Saturday maths/ }).check();
  await page.getByRole('button', { name: /^Assign to classes/ }).click();
  await page.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your assignments' })).toBeVisible();
  const assignment = db.assignments[0];
  db.submissions.push({ id: 'work-1', assignment_id: assignment.id, student_id: school.students[0].id,
    student_code: 'blue-otter', submitted_at: new Date().toISOString(), drawing: {}, attachments: [], students: { name: 'Aisha' } });
  await papers(page);
  await page.getByRole('button', { name: 'Options for Weekly maths practice' }).click();
  const choice = await changeColour(page, db.papers[0].color);
  expect(db.papers[0].status).toBe('published');
  expect(db.papers[0].color).toBe(choice.value);
  await paperMenu(page);
  await page.getByRole('button', { name: 'Archive paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(db.papers[0].is_archived).toBe(true);
  expect(db.papers[0].status).toBe('published');
  expect(db.assignments).toHaveLength(1);
  expect(db.submissions).toHaveLength(1);
  await page.goto('/?assignment=' + assignment.share_token);
  await page.getByLabel('Your student code').fill('red-fox');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.locator('.exam-cover')).toBeVisible();
  await page.goto('/'); await papers(page);
  await page.getByRole('button', { name: 'Show archived papers' }).click();
  await expect(page.locator('.paper-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open paper Weekly maths practice' }).click();
  await expect(page.getByRole('button', { name: 'Assign to classes', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await paperMenu(page);
  await page.getByRole('button', { name: 'Restore paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(db.papers[0].is_archived).toBe(false);
  expect(db.papers[0].status).toBe('published');
  await page.getByRole('button', { name: 'Show active papers' }).click();
  await paperMenu(page);
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('including its class assignments and submitted work');
  await page.getByRole('button', { name: 'Delete paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(db.papers).toHaveLength(0);
  expect(db.assignments).toHaveLength(0);
  expect(db.submissions).toHaveLength(0);
  expect(school.classes).toHaveLength(2);
  await page.goto('/?assignment=' + assignment.share_token);
  await expect(page.getByRole('heading', { name: 'This assignment could not be opened.' })).toBeVisible();
});

test('class colours persist, failed changes keep their previous colour, and the roster stays intact', async ({ page }) => {
  const school = await mockClasses(page);
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button', { name: 'Create class', exact: true }).click();
  await page.getByLabel('Class name').fill('Evening maths');
  await page.getByRole('dialog').getByRole('button', { name: 'Create class', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening maths', exact: true })).toBeVisible();
  const original = school.classes[0].color;
  expect(colours.some(colour => colour.value === original)).toBe(true);
  await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Evening maths', exact: true }).click();
  const choice = colours.find(colour => colour.value !== original)!;
  school.failColour = true;
  await page.getByRole('button', { name: choice.label, exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(school.classes[0].color).toBe(original);
  school.failColour = false;
  await page.getByRole('button', { name: choice.label, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(school.classes[0].color).toBe(choice.value);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await expect(page.locator('.tutor-class-card')).toHaveCSS('--item-colour', choice.accent);
  await page.getByRole('button', { name: 'Open class Evening maths', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add students', exact: true })).toBeEnabled();
});

for (const width of [1440, 768, 390]) {
  test('paper cards and matching compact toolbars fit ' + width + 'px', async ({ page }) => {
    await mockAssignments(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/'); await createPaper(page);
    const preview = page.getByRole('dialog', { name: 'Your practice paper' });
    await expect(preview.locator('.paper-toolbar').getByRole('button', { name: 'Delete paper', exact: true })).toHaveCount(0);
    expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const toolbarHeight = await preview.locator('.paper-toolbar').evaluate(el => el.getBoundingClientRect().height);
    expect(toolbarHeight).toBe(width > 1000 ? 56 : 92);
    const actionBar = preview.locator('.paper-action-bar');
    expect(await actionBar.evaluate(el => el.getBoundingClientRect().height)).toBe(toolbarHeight);
    expect(await actionBar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(actionBar.getByRole('button', { name: 'Save draft', exact: true })).toHaveCSS('height', '32px');
    await expect(actionBar.getByRole('button', { name: 'Publish assignment', exact: true })).toBeDisabled();
    const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
    if (await dismiss.isVisible()) await dismiss.click();
    await preview.screenshot({ path: 'test-results/paper-toolbar-' + width + '.png', animations: 'disabled' });
    await actionBar.screenshot({ path: 'test-results/paper-action-bar-' + width + '.png', animations: 'disabled' });
    await page.emulateMedia({ media: 'print' });
    await expect(actionBar).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await preview.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('.paper-card').getByRole('button', { name: /Delete paper/ })).toHaveCount(0);
    await page.getByPlaceholder(/Search your papers/).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/paper-colours-' + width + '.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Options for Weekly maths practice' }).click();
    await expect(page.getByRole('group', { name: 'Card colour' }).getByRole('button')).toHaveCount(12);
    const menuBox = await page.locator('.item-menu').boundingBox();
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(1000);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Options for Weekly maths practice' })).toBeFocused();
    await paperMenu(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/colour-picker-' + width + '.png', animations: 'disabled' });
    await mockStudentPaper(page);
    await openStudentPaper(page);
    const studentToolbar = page.locator('.student-exam-toolbar');
    expect(await studentToolbar.evaluate(el => el.getBoundingClientRect().height)).toBe(toolbarHeight);
    expect(await studentToolbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(studentToolbar.getByRole('button', { name: 'Pen', exact: true })).toBeVisible();
    await expect(studentToolbar.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeVisible();
    await studentToolbar.screenshot({ path: 'test-results/student-toolbar-' + width + '.png', animations: 'disabled' });
    await page.emulateMedia({ media: 'print' });
    await expect(studentToolbar).toBeHidden();
  });
}


test('class archives retain the roster and support reload, restore and permanent deletion', async ({ page }) => {
  const school = await mockClasses(page);
  school.classes.push({ id: 'weekend', name: 'Weekend maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' });
  school.students.push({ id: 'learner', class_id: 'weekend', student_code: 'blue-otter', name: 'Aisha', is_active: true });
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  const options = page.getByRole('button', { name: 'Options for Weekend maths', exact: true });
  await options.click();
  school.failColour = true;
  await page.getByRole('button', { name: 'Archive class', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(school.classes[0].is_archived).toBeFalsy();
  school.failColour = false;
  await page.getByRole('button', { name: 'Archive class', exact: true }).click();
  await expect(page.locator('.tutor-class-card')).toHaveCount(0);
  expect(school.classes[0].is_archived).toBe(true);
  expect(school.students).toHaveLength(1);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button', { name: 'Show archived classes' }).click();
  await page.getByRole('button', { name: 'Open class Weekend maths' }).click();
  await expect(page.getByLabel('Name for blue-otter', { exact: true })).toHaveValue('Aisha');
  await expect(page.getByRole('button', { name: 'Add students', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete class', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived classes', exact: true }).click();
  await options.click();
  await page.getByRole('button', { name: 'Restore class', exact: true }).click();
  await expect(page.locator('.tutor-class-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show active classes' }).click();
  await expect(page.getByRole('button', { name: 'Open class Weekend maths' })).toContainText('1 student');
  await options.click();
  await page.getByRole('button', { name: 'Archive class', exact: true }).click();
  await page.getByRole('button', { name: 'Show archived classes' }).click();
  await options.click();
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete class?' }).getByRole('button', { name: 'Delete class', exact: true }).click();
  await expect(page.locator('.tutor-class-card')).toHaveCount(0);
  expect(school.classes).toHaveLength(0);
  expect(school.students).toHaveLength(0);
});

test('failed paper archive can be retried and restoring a reviewed paper keeps its review', async ({ page }) => {
  const db = await mockAssignments(page);
  await page.goto('/'); await createPaper(page);
  await page.getByRole('checkbox', { name: 'I have reviewed every question, solution, and marking rubric.' }).check();
  await page.getByRole('button', { name: 'Save reviewed paper' }).click();
  await expect(page.getByRole('status')).toContainText('Paper and rubric saved.');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await paperMenu(page);
  db.failSave = true;
  await page.getByRole('button', { name: 'Archive paper', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(db.papers[0].is_archived).toBe(false);
  db.failSave = false;
  await page.getByRole('button', { name: 'Archive paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show archived papers' }).click();
  await paperMenu(page);
  await page.getByRole('button', { name: 'Restore paper', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(db.papers[0].status).toBe('reviewed');
  await page.getByRole('button', { name: 'Show active papers' }).click();
  await paperMenu(page);
  await page.getByRole('heading', { name: 'Practice papers', exact: true }).click();
  await expect(page.locator('.item-menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open paper Weekly maths practice' }).click();
  await expect(page.getByRole('button', { name: 'Publish assignment', exact: true })).toBeEnabled();
});
