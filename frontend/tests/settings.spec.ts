import { test, expect, type Page } from '@playwright/test';
import { mockAuth, testUser } from './helpers/auth';

async function openSettings(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Jun\./ })).toBeVisible();
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar .profile').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

test('profile name is saved to the tutor account and shown across the workspace', async ({ page }) => {
  await mockAuth(page, true);
  const updates: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() !== 'PUT') return route.fulfill({ json: testUser });
    updates.push(route.request().postDataJSON());
    return route.fulfill({ json: { ...testUser, user_metadata: route.request().postDataJSON().data } });
  });
  await openSettings(page);
  const profile = page.getByRole('complementary', { name: 'Your profile' });
  await expect(profile.getByText('tutor@example.com')).toBeVisible();
  await expect(profile.getByText('Verified')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  await page.getByLabel('Your name').fill('Jun Sheng Toh');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('Profile saved.');
  expect(updates.map(update => update.data)).toEqual([{ name: 'Jun Sheng Toh' }]);
  await expect(page.locator('.sidebar .profile')).toContainText('Jun Sheng Toh');
  await expect(profile.getByRole('heading', { name: 'Jun Sheng Toh' })).toBeVisible();
});

test('password changes are confirmed and failures keep the form usable', async ({ page }) => {
  await mockAuth(page, true);
  let fail = true;
  const passwords: string[] = [];
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() !== 'PUT') return route.fulfill({ json: testUser });
    if (fail) return route.fulfill({ status: 422, json: { error_code: 'same_password', msg: 'same password' } });
    passwords.push(route.request().postDataJSON().password);
    return route.fulfill({ json: testUser });
  });
  await page.route('**/auth/v1/recover*', route => route.fulfill({ json: {} }));
  await openSettings(page);
  await page.getByLabel('New password', { exact: true }).fill('Another-password-1');
  await page.getByLabel('Confirm new password').fill('Different-password-1');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Confirm new password').fill('Another-password-1');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('different from your current one');
  fail = false;
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('Password updated.');
  expect(passwords).toEqual(['Another-password-1']);
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Email me a reset link instead' }).click();
  await expect(page.getByRole('status')).toContainText('reset link is on its way to tutor@example.com');
});

test('settings stack on a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuth(page, true);
  await openSettings(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
});
