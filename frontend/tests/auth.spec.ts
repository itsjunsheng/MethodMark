import { mockStudentPaper } from './helpers/assignments';
import { expect, test } from '@playwright/test';
import { mockAuth, testSession } from './helpers/auth';

test.beforeEach(async ({ page }) => { await mockAuth(page); });

for (const width of [1440, 390]) {
  test(`landing and account popups are usable at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Less marking. More teaching.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create practice paper', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true });
    await page.getByText('Do my students need an account?', { exact: true }).click();
    await expect(page.getByText('No. Students open the practice-paper link', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Create your tutor account' }).click();
    await expect(page.getByRole('heading', { name: 'A fresh start.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('dialog', { name: 'A fresh start.' })).toBeVisible();
    await expect(page.locator('.landing-page')).toBeVisible();
    await page.screenshot({ path: `test-results/signup-popup-${width}.png` });
    await page.getByRole('dialog').getByRole('link', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await page.screenshot({ path: `test-results/login-popup-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('login protects the workspace, persists the session, and logout prevents back navigation', async ({ page }) => {
  await page.goto('/?view=workspace');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email address').fill('tutor@example.com');
  await page.getByLabel('Password', { exact: true }).fill('A-test-password-123');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  await page.locator('.sidebar .profile').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('methodmark-auth'))).toBeNull();
  await page.goto('/?view=workspace');
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('invalid credentials give a generic error without opening the workspace', async ({ page }) => {
  await page.route('**/auth/v1/token*', route => route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid credentials' } }));
  await page.goto('/?view=login');
  await page.getByLabel('Email address').fill('unknown@example.com');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to log in.');
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('registration requests email confirmation and returns to login', async ({ page }) => {
  let signup: Record<string, unknown> = {};
  await page.route('**/auth/v1/signup*', route => {
    signup = route.request().postDataJSON();
    return route.fulfill({ json: { ...testSession().user, identities: [{ id: 'test-identity' }] } });
  });
  await page.goto('/?view=signup');
  await page.getByLabel('Your name').fill('New Tutor');
  await page.getByLabel('Email address').fill('new@example.com');
  await page.getByLabel('New password', { exact: true }).fill('Strong-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Check your email');
  expect(signup.data).toEqual({ name: 'New Tutor' });
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('password reset requests are generic and an expired reset link cannot update a password', async ({ page }) => {
  await page.goto('/?view=forgot-password');
  await page.getByLabel('Email address').fill('tutor@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account uses this email');
  await page.goto('/?view=reset-password');
  await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0);
});

test('a recovery session sets a new password, clears the session, and returns to login', async ({ page }) => {
  const session = testSession();
  const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'recovery' });
  await page.goto(`/?view=reset-password#${hash}`);
  await page.getByLabel('New password', { exact: true }).fill('Replacement-password-123');
  await page.getByLabel('Confirm new password').fill('Does-not-match-123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Confirm new password').fill('Replacement-password-123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('password has been updated');
  expect(await page.evaluate(() => localStorage.getItem('methodmark-auth'))).toBeNull();
});

test('student paper access does not require a session or make authentication calls', async ({ page }) => {
  await mockStudentPaper(page);
  let authRequests = 0;
  page.on('request', request => { if (request.url().includes('/auth/v1/')) authRequests++; });
  await page.goto('/?assignment=30000000-0000-4000-8000-000000000001');
  await page.getByLabel('Your student code').fill('blue-otter');
  await page.getByRole('button', { name: 'Open practice paper' }).click();
  await expect(page.locator('.exam-cover')).toBeVisible();
  expect(authRequests).toBe(0);
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
});

test('logout failure still clears local authentication and denies the workspace', async ({ page }) => {
  await mockAuth(page, true);
  await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 503, json: { message: 'Service unavailable' } }));
  await page.goto('/');
  await page.locator('.sidebar .profile').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('could not confirm server logout');
  expect(await page.evaluate(() => localStorage.getItem('methodmark-auth'))).toBeNull();
});


test('an unverifiable stored session cannot open tutor content', async ({ page }) => {
  await mockAuth(page, true);
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 401, json: { message: 'Expired session' } }));
  await page.goto('/?view=workspace');
  await expect(page.getByRole('alert')).toContainText('session could not be verified');
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('another tutor does not inherit the previous account profile or papers', async ({ page }) => {
  await mockAuth(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning, Jun.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('methodmark:20000000-0000-4000-8000-000000000001:papers:v1', JSON.stringify([])));
  await page.locator('.sidebar .profile').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  const secondUser = { ...testSession().user, id: '20000000-0000-4000-8000-000000000002', user_metadata: { name: 'Another Tutor' } };
  await page.route('**/auth/v1/user', route => route.fulfill({ json: secondUser }));
  await page.route('**/auth/v1/token*', route => route.fulfill({ json: testSession(secondUser) }));
  await page.getByLabel('Email address').fill('another@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Another-password-123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Another.' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice papers', exact: true }).click();
  await expect(page.locator('.paper-card')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('methodmark:20000000-0000-4000-8000-000000000001:papers:v1'))).toBe('[]');
});


test('account popup switches in place, traps focus and restores the landing page on close', async ({ page }) => {
  await page.goto('/');
  await page.locator('body').evaluate(element => element.dataset.navigationProbe = 'same-document');
  const trigger = page.getByRole('link', { name: 'Get started with MethodMark' });
  await trigger.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('open', '');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await dialog.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(dialog.getByRole('heading', { name: 'A little reset.' })).toBeVisible();
  await page.goBack();
  await expect(dialog.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-navigation-probe', 'same-document');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await trigger.click();
  await page.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
});

test('a short mobile screen scrolls within the signup popup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto('/?view=signup');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const submit = dialog.getByRole('button', { name: 'Create account' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await page.screenshot({ path: 'test-results/signup-popup-short-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
