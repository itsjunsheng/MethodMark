import { mockAssignments } from './assignments';
import type { Page } from '@playwright/test';

export const testUser = {
  id: '20000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'tutor@example.com', email_confirmed_at: '2026-09-29T00:00:00Z',
  user_metadata: { name: 'Jun Sheng' }, app_metadata: { provider: 'email', providers: ['email'] },
  identities: [], created_at: '2026-09-29T00:00:00Z', is_anonymous: false,
};
export function testSession(user = testUser) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires, role: 'authenticated' })}.test-signature`,
    token_type: 'bearer', expires_in: 3600, expires_at: expires, refresh_token: 'test-refresh-token', user };
}

export async function mockAuth(page: Page, signedIn = false) {
  const session = testSession();
  await mockAssignments(page);
  await page.route('**/rest/v1/classes*', route => route.fulfill({ json: [] }));
  await page.route('**/auth/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (path.endsWith('/recover')) return route.fulfill({ json: {} });
    if (path.endsWith('/signup')) return route.fulfill({ json: testUser });
    if (path.endsWith('/user')) return route.fulfill({ json: testUser });
    if (path.endsWith('/token')) return route.fulfill({ json: session });
    return route.fulfill({ status: 400, json: { message: 'Unexpected mock auth request' } });
  });
  if (signedIn) await page.addInitScript(session => {
    if (!sessionStorage.getItem('test-auth-initialized')) {
      localStorage.setItem('methodmark-auth', JSON.stringify(session));
      sessionStorage.setItem('test-auth-initialized', 'true');
    }
  }, session);
}
