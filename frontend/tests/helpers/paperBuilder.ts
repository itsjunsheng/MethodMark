import type { Page } from '@playwright/test';

export async function selectPaperScope(page: Page, subject = 'Mathematics', year = '3', level = 'G3') {
  await page.getByRole('combobox', { name: 'Subject', exact: true }).selectOption(subject);
  await page.getByRole('combobox', { name: 'School year', exact: true }).selectOption(year);
  await page.getByRole('combobox', { name: 'Subject level', exact: true }).selectOption(level);
}

export async function selectDifficulty(page: Page, level: 'easy' | 'medium' | 'hard') {
  await page.getByRole('radio', { name: level[0].toUpperCase() + level.slice(1), exact: true }).check();
}
