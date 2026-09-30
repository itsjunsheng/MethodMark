import { expect, test } from '@playwright/test';
import { mockAuth } from './helpers/auth';
import { mockClasses } from './helpers/classes';

for (const width of [1440, 390]) {
  test('errors stay readable and dismissible above the account dialog at ' + width + 'px', async ({ page }) => {
    await mockAuth(page);
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/auth/v1/token*', route => route.fulfill({
      status: 400, json: { code: 'invalid_credentials', msg: 'Invalid credentials' },
    }));
    await page.goto('/?view=login');
    await page.getByLabel('Email address').fill('tutor@example.com');
    await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const toast = page.getByRole('complementary', { name: 'Notifications' });
    await expect(toast.getByRole('alert')).toContainText('Unable to log in.');
    const bounds = (await toast.boundingBox())!;
    expect(bounds.y).toBeLessThan(25);
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(2);
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/toast-login-' + width + '.png', animations: 'disabled' });
    await page.clock.install();
    await page.clock.fastForward(15000);
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(toast).toHaveCount(1);
    await toast.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(toast).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue('tutor@example.com');
  });
}

test('copy feedback does not shift the roster and pauses on hover or keyboard focus', async ({ page }) => {
  await mockAuth(page, true);
  const school = await mockClasses(page);
  school.classes.push({ id: 'class-1', name: 'Morning maths', subject: 'Mathematics', school_year: 1, subject_level: 'G3' });
  school.students.push({ id: 'student-1', class_id: 'class-1', student_code: 'yellow-dolphin', name: null, is_active: true });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => {} },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button', { name: /Morning maths/ }).click();
  const search = page.getByRole('textbox', { name: 'Search students' });
  const before = await search.boundingBox();
  await page.clock.install();
  await page.getByRole('button', { name: 'Copy code yellow-dolphin', exact: true }).click();
  const toast = page.getByRole('complementary', { name: 'Notifications' });
  await expect(toast.getByRole('status')).toHaveText('yellow-dolphin copied.');
  expect((await search.boundingBox())!.y).toBe(before!.y);
  await toast.hover();
  await page.clock.fastForward(7000);
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss notification' }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7000);
  await expect(toast).toBeVisible();
  await search.focus();
  await page.clock.fastForward(5100);
  await expect(toast).toHaveCount(0);
});

test('a saved class confirmation survives closing its dialog', async ({ page }) => {
  await mockAuth(page, true);
  await mockClasses(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Classes & students', exact: true }).click();
  await page.getByRole('button', { name: 'Create class', exact: true }).click();
  await page.getByLabel('Class name').fill('New class');
  await page.getByRole('dialog').getByRole('button', { name: 'Create class', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Notifications' }).getByRole('status')).toHaveText('Class created.');
});
