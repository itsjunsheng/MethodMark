import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { mockInsights, emptyInsights } from './helpers/insights';

test.beforeEach(async ({ page }) => { await mockAuth(page, true); });

async function openInsights(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Jun\./ })).toBeVisible();
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Insights', exact: true }).click();
}

test('overview shows real checked-work figures instead of sample data', async ({ page }) => {
  await mockInsights(page);
  await page.goto('/');
  const stats = page.locator('.stats-grid');
  await expect(stats.getByText('65%')).toBeVisible();
  await expect(stats.getByText('From 52 checked parts')).toBeVisible();
  await expect(stats.getByText('48')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Average score by assignment: Algebra checkpoint 58%, Quadratics practice 71%/ })).toBeVisible();
});

test('insights summarise checked work, with tables, tooltips and student drill-down', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockInsights(page);
  await openInsights(page);
  const summary = page.getByRole('region', { name: 'Summary' });
  for (const value of ['65%', '78%', '51%', '29%', '74%']) await expect(summary.getByText(value, { exact: true })).toBeVisible();
  await expect(summary.getByText('9 of 31 parts with both mark types')).toBeVisible();

  // Every chart has a table twin.
  await page.getByRole('button', { name: 'Table' }).first().click();
  await expect(page.getByRole('cell', { name: 'Quadratics practice' })).toBeVisible();
  await page.getByRole('button', { name: 'Chart' }).click();
  const trend = page.getByRole('img', { name: /Average score by assignment/ });
  await trend.focus();
  await expect(page.getByRole('status').filter({ hasText: 'Quadratics practice' })).toBeVisible();
  await trend.press('ArrowLeft');
  await expect(page.getByRole('status').filter({ hasText: 'Algebra checkpoint' })).toBeVisible();

  await expect(page.getByText('Needs support')).toHaveCount(1);
  await expect(page.getByText('Obtains both roots, 3/2 and −2.')).toBeVisible();
  await expect(page.getByText('5 of 6 missed')).toBeVisible();
  await expect(page.getByText('Your factorisation is right. Check the signs when you solve each bracket.')).toBeVisible();
  await expect(page.getByText('6 reviewed · 1 awaiting review · 1 not submitted')).toBeVisible();
  await expect(page.getByText('1 grading failed', { exact: false })).toBeVisible();

  const rows = page.locator('.insights-student-table tbody tr');
  await expect(rows.first()).toContainText('red-fox');
  await expect(rows.nth(2)).toContainText('No checked work');
  await page.getByLabel('Search students').fill('aisha');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Aisha' }).click();
  const detail = page.getByRole('dialog', { name: 'Aisha' });
  await expect(detail.getByText('class 48%')).toBeVisible();
  await expect(detail.getByText('Learning focus')).toBeVisible();
  await expect(detail.getByText('Quadratics practice')).toBeVisible();
  await detail.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: 'test-results/insights-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('filters scope every view and the report exports the current students', async ({ page }) => {
  const requests = await mockInsights(page);
  await openInsights(page);
  await page.getByLabel('Filter insights by class').selectOption({ label: 'Sunday maths' });
  await page.getByLabel('Filter insights by period').selectOption({ label: 'Last 30 days' });
  await expect.poll(() => requests.at(-1)?.search).toBe('?class_id=40000000-0000-4000-8000-000000000002&days=30');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.insights-filters').getByRole('button', { name: 'Export report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('methodmark-insights.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('"red-fox","","Saturday maths","2","2","41.7"');
  expect(csv).toContain('"Quadratic equations; Coordinate geometry"');
});

test('without checked work the page explains what is missing and links to the queue', async ({ page }) => {
  await mockInsights(page, { ...emptyInsights, summary: { ...emptyInsights.summary, submissions: 3, total_parts: 12 },
    status: [{ assignment_id: 'a1', title: 'Algebra checkpoint', class_name: 'Saturday maths', due_at: null, students: 4,
      submitted: 3, not_submitted: 1, processing: 1, awaiting_review: 2, failed: 0, reviewed: 0 }] });
  await openInsights(page);
  await expect(page.getByText('No checked work yet.')).toBeVisible();
  await expect(page.getByText('2 awaiting review · 1 processing · 1 not submitted')).toBeVisible();
  await expect(page.locator('.insights-kpi strong').first()).toHaveText('–');
  await page.getByRole('button', { name: 'Open marking queue' }).click();
  await expect(page.getByRole('heading', { name: 'Marking queue', exact: true })).toBeVisible();
});

test('insights fit a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsights(page);
  await openInsights(page);
  await expect(page.getByRole('region', { name: 'Summary' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/insights-mobile.png', fullPage: true });
});
