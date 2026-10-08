import { mockAssignments } from './helpers/assignments';
import { mockAuth } from './helpers/auth';
import { expect, test } from '@playwright/test';
import questions from './fixtures/questions.json' with { type: 'json' };
import { selectDifficulty, selectPaperScope } from './helpers/paperBuilder';

test.beforeEach(async ({ page }) => { await mockAuth(page, true); });

const endpoint = '**/api/v1/sample-paper/questions';

test('required selections filter the paper while optional fields can stay blank', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate sample paper' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'School year', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Subject level', exact: true })).toBeDisabled();
  await selectPaperScope(page);
  await expect(page.getByText('1 matching question available', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Pythagoras theorem', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await expect(page.locator('.exam-question')).toHaveCount(1);
  await expect(page.locator('.exam-answer-line')).toHaveCount(1);
  await expect(page.locator('.exam-cover')).toContainText('Secondary 3 (G3)');
  await expect(page.locator('.exam-cover')).toContainText('Question bank practice');
  await expect(page.locator('.paper-modal .paper-toolbar')).toContainText('2 marks');
  await expect(page.locator('.exam-document')).not.toContainText('Find 20% of 80.');
});

test('topics use any selected topic and combine with difficulty; parts stay together', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Quadratic equations', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Linear equations', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByRole('button', { name: /^Topics/ })).toContainText('All topics');
  await expect(page.getByText('1 matching question available', { exact: true })).toBeVisible();
  await selectDifficulty(page, 'medium');
  await expect(page.getByText('1 matching question available', { exact: true })).toBeVisible();
  await selectDifficulty(page, 'easy');
  await page.getByRole('button', { name: /^Topics/ }).click();
  await page.getByRole('checkbox', { name: 'Linear equations', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Generate sample paper' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Quadratic equations', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Linear equations', exact: true }).check();
  await page.getByRole('button', { name: /^Topics/ }).click();
  await page.getByLabel('Number of questions').fill('1');
  await page.getByLabel('Duration (minutes)').fill('60');
  await page.getByLabel('Paper title').fill('Linear equations practice');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await expect(page.locator('.exam-question')).toHaveCount(1);
  await expect(page.locator('.exam-answer-line')).toHaveCount(2);
  await expect(page.locator('.exam-question')).toContainText('Find y when x = 4.');
  await expect(page.locator('.exam-question')).toContainText('Find x when y = 20.');
  await expect(page.locator('.exam-cover')).toContainText('60 minutes');
  await expect(page.locator('.exam-cover')).toContainText('Linear equations practice');
});

test('parent selection changes reset dependent options and use new scope', async ({ page }) => {
  const extraSubject = { ...questions[0], id: '20000000-0000-4000-8000-000000000001',
    subject: 'Additional Mathematics', school_year: 4, subject_level: 'G3', topics: ['Functions'] };
  await page.route(endpoint, route => route.fulfill({ json: [...questions, extraSubject] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByRole('button', { name: /^Topics/ }).click();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByRole('combobox', { name: 'School year', exact: true }).selectOption('2');
  await expect(page.getByRole('combobox', { name: 'Subject level', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Subject level', exact: true }).selectOption('G3');
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Pythagoras theorem', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Quadratic equations', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject level', exact: true }).selectOption('G2');
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Linear equations', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Pythagoras theorem', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Subject', exact: true }).selectOption('Additional Mathematics');
  await expect(page.getByRole('combobox', { name: 'School year', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Subject level', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'School year', exact: true }).selectOption('4');
  await page.getByRole('combobox', { name: 'Subject level', exact: true }).selectOption('G3');
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Functions', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Topics/ }).click();
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await expect(page.locator('.exam-question')).toHaveCount(1);
  await expect(page.locator('.exam-cover')).toContainText('Additional Mathematics');
  await expect(page.locator('.exam-cover')).toContainText('Secondary 4 (G3)');
});

test('unavailable difficulty and invalid counts cannot silently generate a different paper', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  const generate = page.getByRole('button', { name: 'Generate sample paper' });
  await selectDifficulty(page, 'hard');
  await expect(page.locator('.builder-availability')).toContainText('No questions match these selections.');
  await expect(generate).toBeDisabled();
  await selectDifficulty(page, 'medium');
  for (const count of ['0', '-1', '1.5']) {
    await page.getByLabel('Number of questions').fill(count);
    await expect(page.getByRole('alert')).toContainText('Enter a whole number of at least 1.');
    await expect(generate).toBeDisabled();
  }
  await page.getByLabel('Number of questions').fill('3');
  await expect(page.getByRole('alert')).toContainText('Only 1 matching question is available.');
  await expect(generate).toBeDisabled();
  await page.getByLabel('Number of questions').fill('');
  await expect(generate).toBeEnabled();
  await page.getByLabel('Duration (minutes)').fill('');
  await generate.click();
  await expect(page.locator('.builder-form')).toBeVisible();
  await page.getByLabel('Duration (minutes)').fill('45');
  await generate.click();
  await expect(page.locator('.exam-question')).toHaveCount(1);
});

test('a requested count samples unique matching questions without changing the source bank', async ({ page }) => {
  const db = await mockAssignments(page);
  const scoped = questions.map(question => ({ ...question, school_year: 3, subject_level: 'G3', difficulty: 'medium' }));
  await page.route(endpoint, route => route.fulfill({ json: scoped }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await page.getByLabel('Number of questions').fill('3');
  await page.getByRole('button', { name: 'Generate sample paper' }).click();
  await expect(page.locator('.exam-question')).toHaveCount(3);
  const ids = db.papers[0].questions_snapshot.map(q => q.id);
  expect(new Set(ids).size).toBe(3);
  expect(ids.every((id: string) => questions.some(question => question.id === id))).toBe(true);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  await selectPaperScope(page);
  await expect(page.getByText('5 matching questions available', { exact: true })).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`builder sections, difficulty choices and footer are usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route(endpoint, route => route.fulfill({ json: questions }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
    await selectPaperScope(page);
    const fields = page.locator('.paper-builder-fields');
    expect(await fields.locator('select, .topics-select-trigger, input:not([type="checkbox"]):not([type="radio"])').evaluateAll(elements => elements.map(element => element.matches('button') ? 'Topics optional' : element.getAttribute('aria-label') || element.closest('label')!.firstChild!.textContent!.trim()))).toEqual([
      'Subject', 'School year', 'Subject level', 'Topics optional', 'Paper title optional', 'Number of questions optional', 'Duration (minutes)',
    ]);
    await expect(page.getByRole('region', { name: 'Question selection' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Paper details' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Difficulty', exact: true }).getByRole('radio', { name: 'Medium' })).toBeChecked();
    const title = page.locator('.paper-builder-details > label').first();
    expect(await title.evaluate(element => {
      const row = element.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(row.firstChild!);
      const name = range.getBoundingClientRect(), optional = row.querySelector('.optional')!.getBoundingClientRect();
      return optional.left >= name.right && optional.top < name.bottom;
    })).toBe(true);
    const row = [page.getByLabel('Paper title'), page.getByLabel('Number of questions'), page.getByLabel('Duration (minutes)')];
    const boxes = await Promise.all(row.map(control => control.boundingBox()));
    if (width > 700) {
      expect(new Set(boxes.map(box => Math.round(box!.y))).size).toBe(1);
    } else {
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
      expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height);
    }
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Generate sample paper' })).toBeInViewport();
    await dialog.screenshot({ path: `test-results/paper-builder-${width}.png` });
    const topics = page.getByRole('button', { name: /^Topics/ });
    await topics.click();
    const menu = page.getByRole('group', { name: 'Available topics' });
    const triggerBox = (await topics.boundingBox())!;
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeCloseTo(triggerBox.x, 0);
    expect(menuBox.width).toBeCloseTo(triggerBox.width, 0);
    for (const label of await menu.locator('label').all()) {
      const checkbox = (await label.locator('input').boundingBox())!;
      const text = (await label.locator('span').boundingBox())!;
      expect(checkbox.y + checkbox.height / 2).toBeCloseTo(text.y + text.height / 2, 0);
      expect(text.x).toBeGreaterThan(checkbox.x + checkbox.width);
    }
    await dialog.screenshot({ path: `test-results/topics-menu-${width}.png` });
  });
}

test('topics default to checked and support select all, clear all, keyboard and outside dismissal', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: questions }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create practice paper', exact: true }).click();
  const trigger = page.getByRole('button', { name: /^Topics/ });
  const generate = page.getByRole('button', { name: 'Generate sample paper' });
  const linear = page.getByRole('checkbox', { name: 'Linear equations', exact: true });
  const quadratic = page.getByRole('checkbox', { name: 'Quadratic equations', exact: true });
  await expect(trigger).toBeDisabled();
  await selectPaperScope(page);
  await trigger.focus();
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(linear).toBeChecked();
  await expect(quadratic).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(linear).toBeFocused();
  await page.keyboard.press('Space');
  await expect(linear).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Available topics' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('Quadratic equations');
  await trigger.click();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(linear).not.toBeChecked();
  await expect(quadratic).not.toBeChecked();
  await expect(trigger).toContainText('Select topics');
  await expect(page.locator('.builder-availability')).toContainText('Select at least one topic');
  await expect(generate).toBeDisabled();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(linear).toBeChecked();
  await expect(quadratic).toBeChecked();
  await expect(trigger).toContainText('All topics');
  await expect(generate).toBeEnabled();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByLabel('Duration (minutes)').click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(linear).not.toBeChecked();
  await expect(quadratic).not.toBeChecked();
  await quadratic.check();
  await page.getByLabel('Duration (minutes)').click();
  await expect(generate).toBeEnabled();
  for (const level of ['easy', 'medium', 'hard'] as const) {
    await selectDifficulty(page, level);
    await expect(page.getByRole('radio', { name: level[0].toUpperCase() + level.slice(1), exact: true })).toBeChecked();
  }
  await page.getByRole('radio', { name: 'Hard', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Medium', exact: true })).toBeChecked();
});
