import { mockStudentPaper } from './helpers/assignments';
import { expect, test } from '@playwright/test';
import { drawStroke, openStudentPaper } from './helpers/handwriting';

test.beforeEach(async ({ page }) => { await mockStudentPaper(page); });

test('writing, erasing and global undo/redo keep other questions intact', async ({ page }) => {
  await openStudentPaper(page);
  const first = page.getByRole('img', { name: 'Writing space for question 1', exact: true });
  const second = page.getByRole('img', { name: 'Writing space for question 2', exact: true });
  await expect(page.getByRole('button', { name: 'Scroll', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await drawStroke(page, first);
  await drawStroke(page, second);
  const firstPath = await first.locator('path').getAttribute('d');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(second.locator('path')).toHaveCount(0);
  await expect(first.locator('path')).toHaveAttribute('d', firstPath!);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(second.locator('path')).toHaveCount(1);

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await first.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * .3, box.y + 40);
  await expect(first.locator('path')).toHaveCount(0);
  await expect(second.locator('path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first.locator('path')).toHaveAttribute('d', firstPath!);
  await drawStroke(page, first, 40);
  await expect(first.locator('path')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});

test('drafts survive reload, save erasures, and stay separate by student and assignment', async ({ page }) => {
  await openStudentPaper(page, ' BLUE-OTTER ');
  const first = page.getByRole('img', { name: 'Writing space for question 1', exact: true });
  await drawStroke(page, first);
  const path = await first.locator('path').getAttribute('d');
  await openStudentPaper(page);
  await expect(first.locator('path')).toHaveAttribute('d', path!);
  await openStudentPaper(page, 'red-fox');
  await expect(page.locator('.handwriting-area path')).toHaveCount(0);
  await openStudentPaper(page, 'blue-otter', '30000000-0000-4000-8000-000000000002');
  await expect(page.locator('.handwriting-area path')).toHaveCount(0);
  await openStudentPaper(page);
  await expect(first.locator('path')).toHaveAttribute('d', path!);
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await first.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * .3, box.y + 40);
  await openStudentPaper(page);
  await expect(page.locator('.handwriting-area path')).toHaveCount(0);
});

test('stylus input draws, ignores extra pointers, and cancels incomplete gestures', async ({ page }) => {
  await openStudentPaper(page);
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const area = page.getByRole('img', { name: 'Writing space for question 1', exact: true });
  await area.evaluate(element => {
    element.scrollIntoView({ block: 'center' });
    element.addEventListener('pointerdown', event => element.setAttribute('data-pointer', String((event as PointerEvent).pointerId)));
  });
  const box = (await area.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', pointerType: 'pen', button: 'left', buttons: 1, clickCount: 1, x: box.x + 40, y: box.y + 20 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', pointerType: 'pen', buttons: 1, x: box.x + 90, y: box.y + 30 });
  await area.dispatchEvent('pointerdown', { pointerId: 90, pointerType: 'touch', isPrimary: false, button: 0, clientX: box.x + 150, clientY: box.y + 50 });
  await area.dispatchEvent('pointerup', { pointerId: 90, pointerType: 'touch', isPrimary: false, button: 0 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', pointerType: 'pen', button: 'left', buttons: 0, clickCount: 1, x: box.x + 100, y: box.y + 30 });
  await expect(area.locator('path')).toHaveCount(1);
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 70);
  await expect(area.locator('path')).toHaveCount(2);
  const pointer = Number(await area.getAttribute('data-pointer'));
  await area.dispatchEvent('pointercancel', { pointerId: pointer, pointerType: 'mouse' });
  await page.mouse.up();
  await expect(area.locator('path')).toHaveCount(1);
  await openStudentPaper(page);
  await expect(area.locator('path')).toHaveCount(1);
});

test('storage failures keep visible ink and clearly report that the draft was not saved', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('methodmark:handwriting:')) throw new DOMException('Storage full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await openStudentPaper(page);
  await drawStroke(page, page.getByRole('img', { name: 'Writing space for question 1', exact: true }));
  await expect(page.locator('.handwriting-area path')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page.getByRole('button', { name: 'Submit work' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled();
});

test('photo fallback validates images, permits removal before submission, and locks completed work', async ({ page }) => {
  await openStudentPaper(page);
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.getByText('Wrote on paper? Attach photos instead', { exact: true }).click();
  const upload = page.getByLabel('Upload handwritten solutions');
  await upload.setInputFiles({ name: 'work.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toHaveText('Choose JPG or PNG images under 10 MB.');
  await upload.setInputFiles({ name: 'working.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Remove working.png' }).click();
  await expect(page.getByRole('button', { name: 'Submit work' })).toBeDisabled();
  await upload.setInputFiles({ name: 'working.png', mimeType: 'image/png', buffer: Buffer.from('test-image') });
  await page.getByRole('button', { name: 'Submit work' }).click();
  await expect(page.getByRole('heading', { name: 'Your work has been submitted.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View paper' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Published practice paper' })).toHaveCount(0);
  await expect(upload).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit work' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveCount(0);
});

test.describe('touch input', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('Scroll moves the page and Pen ignores finger input', async ({ page }) => {
    await openStudentPaper(page);
    const area = page.getByRole('img', { name: 'Writing space for question 1', exact: true });
    await area.evaluate(element => element.scrollIntoView({ block: 'center' }));
    let box = (await area.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + 30 }] });
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2, y: box.y + 30 - step * 30 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll + 100);
    await expect(page.locator('.handwriting-area path')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pen', exact: true }).click();
    await area.evaluate(element => element.scrollIntoView({ block: 'center' }));
    box = (await area.boundingBox())!;
    const fingerStroke = async () => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 40, y: box.y + 20 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 90, y: box.y + 40 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await fingerStroke();
    await expect(area.locator('path')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/handwriting-mobile.png' });
  });
});
