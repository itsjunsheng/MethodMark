import { expect, test, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { mockClasses } from './helpers/classes';

async function openClasses(page: Page) {
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.locator('.sidebar').getByRole('button', { name: 'Classes & students', exact: true }).click();
}
async function create(page: Page, name = 'Saturday maths') {
  await page.getByRole('button', { name: 'Create class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a class' });
  await dialog.getByLabel('Class name').fill(name);
  await dialog.getByLabel('School year').selectOption('3');
  await dialog.getByRole('button', { name: 'Create class', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function add(page: Page, count: string) {
  await page.getByRole('button', { name: 'Add students', exact: true }).click();
  await page.getByLabel('Number of students').fill(count);
  await page.getByRole('dialog').getByRole('button', { name: 'Add ' + count + (count === '1' ? ' student' : ' students'), exact: true }).click();
}
test.beforeEach(async ({ page }) => { await mockAuth(page, true); });

test('empty database has no sample students; class and names survive reload', async ({ page }) => {
  const state = await mockClasses(page);
  await page.goto('/');
  await openClasses(page);
  await expect(page.getByText('Your first class starts here.')).toBeVisible();
  await expect(page.locator('.classes-page').getByText(/Chloe|Approved average|S301/)).toHaveCount(0);
  await create(page);
  expect(state.classes).toHaveLength(1);
  expect(state.classes[0]).toMatchObject({ name: 'Saturday maths', school_year: 3, subject: 'Mathematics', subject_level: 'G3' });
  await add(page, '3');
  await expect(page.getByText('blue-panda', { exact: true })).toBeVisible();
  await expect(page.locator('.roster-list > li')).toHaveCount(3);
  expect(state.students.every(student => student.name === null)).toBe(true);
  await page.getByLabel('Name for blue-panda', { exact: true }).fill('  Aisha Tan  ');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByLabel('Name for blue-panda', { exact: true })).toHaveValue('Aisha Tan');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy codes', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('blue-panda\tAisha Tan');
  await page.getByLabel('Search students').fill('aisha');
  await expect(page.locator('.roster-list > li')).toHaveCount(1);
  await page.reload();
  await openClasses(page);
  await page.getByRole('button', { name: 'Open class Saturday maths', exact: true }).click();
  await expect(page.getByLabel('Name for blue-panda', { exact: true })).toHaveValue('Aisha Tan');
  await page.getByLabel('Name for blue-panda', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByText('Student name saved.', { exact: true })).toBeVisible();
  expect(state.students[0].name).toBeNull();
});

test('retrying a lost add response reuses student IDs and codes', async ({ page }) => {
  const state = await mockClasses(page);
  await page.goto('/'); await openClasses(page); await create(page);
  state.loseAddResponse = true;
  await add(page, '2');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Add 2 students', exact: true }).click();
  await expect(page.locator('.roster-list > li')).toHaveCount(2);
  expect(state.students).toHaveLength(2);
  expect(state.students.filter(student => student.is_active)).toHaveLength(2);
  expect(state.additions[0]).toEqual(state.additions[1]);
});

test('each class creates independent students and never offers existing students', async ({ page }) => {
  const state = await mockClasses(page);
  await page.goto('/'); await openClasses(page); await create(page); await add(page, '1');
  await page.getByLabel('Name for blue-panda', { exact: true }).fill('Aisha');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByText('Student name saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await create(page, 'Sunday maths');
  await page.getByRole('button', { name: 'Add students', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Existing students', exact: true })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Add 1 student', exact: true }).click();
  await expect(page.getByLabel('Name for blue-panda', { exact: true })).toHaveValue('');
  await page.getByLabel('Name for blue-panda', { exact: true }).fill('Aisha Tan');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByText('Student name saved.', { exact: true })).toBeVisible();
  expect(state.students).toHaveLength(2);
  expect(state.students[0].id).not.toBe(state.students[1].id);
  expect(state.students[0].class_id).not.toBe(state.students[1].class_id);
  expect(state.students[0].name).toBe('Aisha');
  expect(state.students[1].name).toBe('Aisha Tan');
  await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await page.getByRole('button', { name: 'Open class Saturday maths', exact: true }).click();
  await expect(page.getByLabel('Name for blue-panda', { exact: true })).toHaveValue('Aisha');
});

test('load errors do not show fake data and a failed name save remains editable', async ({ page }) => {
  const state = await mockClasses(page);
  state.failLoad = true;
  await page.goto('/'); await openClasses(page);
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Your first class starts here.')).toHaveCount(0);
  state.failLoad = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await create(page); await add(page, '1');
  state.failRename = true;
  await page.getByLabel('Name for blue-panda', { exact: true }).fill('Ben');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(state.students[0].name).toBeNull();
  await expect(page.getByLabel('Name for blue-panda', { exact: true })).toHaveValue('Ben');
  await page.getByRole('button', { name: 'Save name for blue-panda', exact: true }).click();
  await expect(page.getByText('Student name saved.', { exact: true })).toBeVisible();
  expect(state.students[0].name).toBe('Ben');
});

test('removal disables the class record and leaves other classes unchanged', async ({ page }) => {
  const state = await mockClasses(page);
  state.classes.push(
    { id: 'saturday', name: 'Saturday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
    { id: 'sunday', name: 'Sunday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
  );
  state.students.push(
    { id: 'sat-aisha', name: 'Aisha', class_id: 'saturday', student_code: 'blue-panda', is_active: true },
    { id: 'sun-aisha', name: 'Aisha', class_id: 'sunday', student_code: 'green-otter', is_active: true },
  );
  await page.goto('/'); await openClasses(page);
  await page.getByRole('button', { name: 'Open class Saturday maths', exact: true }).click();
  await page.getByRole('button', { name: 'Remove blue-panda from class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove student?' });
  await expect(dialog.getByText('Aisha (blue-panda)', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Saturday maths', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.removals).toHaveLength(0);
  await expect(page.getByText('blue-panda', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove blue-panda from class', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove from class', exact: true }).click();
  await expect(page.getByRole('heading', { name: '0 students', exact: true })).toBeVisible();
  await expect(page.getByText('Ready for your students.')).toBeVisible();
  expect(state.removals).toEqual([{ classId: 'saturday', id: 'sat-aisha' }]);
  expect(state.students[0].is_active).toBe(false);
  expect(state.students[1]).toMatchObject({ id: 'sun-aisha', name: 'Aisha', is_active: true });
  await page.reload(); await openClasses(page);
  await expect(page.getByRole('button', { name: 'Open class Saturday maths', exact: true })).toContainText('0 students');
  await expect(page.getByRole('button', { name: 'Open class Sunday maths', exact: true })).toContainText('1 student');
  await page.getByRole('button', { name: 'Open class Sunday maths', exact: true }).click();
  await expect(page.getByLabel('Name for green-otter', { exact: true })).toHaveValue('Aisha');
});

test('a failed removal keeps the roster and supports retry', async ({ page }) => {
  const state = await mockClasses(page);
  await page.goto('/'); await openClasses(page); await create(page); await add(page, '2');
  await expect(page.locator('.roster-list > li')).toHaveCount(2);
  state.failRemove = true;
  await page.getByRole('button', { name: 'Remove blue-panda from class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove student?' });
  await dialog.getByRole('button', { name: 'Remove from class', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Could not remove this student. Please try again.');
  expect(state.students.filter(student => student.is_active)).toHaveLength(2);
  await expect(page.locator('.roster-list > li')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Remove from class', exact: true }).click();
  await expect(page.locator('.roster-list > li')).toHaveCount(1);
  await expect(page.getByText('green-otter', { exact: true })).toBeVisible();
  expect(state.students).toHaveLength(2);
});

test('class deletion removes its students and preserves other classes', async ({ page }) => {
  const state = await mockClasses(page);
  state.classes.push(
    { id: 'saturday', name: 'Saturday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
    { id: 'sunday', name: 'Sunday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
  );
  state.students.push(
    { id: 'sat-aisha', name: 'Aisha', class_id: 'saturday', student_code: 'blue-panda', is_active: true },
    { id: 'sun-aisha', name: 'Aisha', class_id: 'sunday', student_code: 'green-otter', is_active: true },
    { id: 'sat-ben', name: 'Ben', class_id: 'saturday', student_code: 'red-fox', is_active: true },
  );
  await page.goto('/'); await openClasses(page);
  await page.getByRole('button', { name: 'Open class Saturday maths', exact: true }).click();
  if (await page.getByRole('button', { name: 'All classes', exact: true }).isVisible()) await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Saturday maths', exact: true }).click();
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete class?' });
  await expect(dialog.getByText('Saturday maths', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/students, assignments and submitted work/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.deletedClasses).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Open class Saturday maths', exact: true })).toContainText('2 students');
  if (await page.getByRole('button', { name: 'All classes', exact: true }).isVisible()) await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Saturday maths', exact: true }).click();
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete class', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your classes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open class Saturday maths', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open class Sunday maths', exact: true })).toContainText('1 student');
  expect(state.deletedClasses).toEqual(['saturday']);
  expect(state.students).toEqual([
    { id: 'sun-aisha', name: 'Aisha', class_id: 'sunday', student_code: 'green-otter', is_active: true },
  ]);
  await page.reload(); await openClasses(page);
  await expect(page.getByRole('button', { name: 'Open class Saturday maths', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open class Sunday maths', exact: true }).click();
  await expect(page.getByLabel('Name for green-otter', { exact: true })).toHaveValue('Aisha');
});

test('failed class deletion keeps the class and can be retried', async ({ page }) => {
  const state = await mockClasses(page);
  await page.goto('/'); await openClasses(page); await create(page);
  state.failDeleteClass = true;
  if (await page.getByRole('button', { name: 'All classes', exact: true }).isVisible()) await page.getByRole('button', { name: 'All classes', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Saturday maths', exact: true }).click();
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete class?' });
  await dialog.getByRole('button', { name: 'Delete class', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Could not delete this class. Please try again.');
  expect(state.classes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Delete class', exact: true }).click();
  await expect(page.getByText('Your first class starts here.')).toBeVisible();
  expect(state.classes).toHaveLength(0);
});

for (const width of [390, 768]) {
  test('class management fits a ' + width + 'px screen', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockClasses(page);
    await page.goto('/'); await openClasses(page); await create(page); await add(page, '2');
    await expect(page.getByText('blue-panda', { exact: true })).toBeVisible();
    expect((await page.getByLabel('Name for blue-panda', { exact: true }).boundingBox())!.width).toBeGreaterThan(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Add students', exact: true }).click();
    await page.getByLabel('Number of students').fill('51');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Add students', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.screenshot({ path: 'test-results/classes-' + width + '.png', fullPage: true });
    await page.getByRole('button', { name: 'Remove blue-panda from class', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Remove student?' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Remove from class', exact: true }).click();
    await expect(page.locator('.roster-list > li')).toHaveCount(1);
    if (await page.getByRole('button', { name: 'All classes', exact: true }).isVisible()) await page.getByRole('button', { name: 'All classes', exact: true }).click();
    await page.getByRole('button', { name: 'Options for Saturday maths', exact: true }).click();
    await page.getByRole('button', { name: 'Delete class', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Delete class?' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/delete-class-' + width + '.png', fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Delete class', exact: true }).click();
    await expect(page.getByText('Your first class starts here.')).toBeVisible();
  });
}
