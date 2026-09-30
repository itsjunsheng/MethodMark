import type { Locator, Page } from '@playwright/test';

export async function openStudentPaper(page: Page, code = 'blue-otter', assignment = '30000000-0000-4000-8000-000000000001') {
  await page.goto(`/?assignment=${assignment}`);
  await page.getByLabel('Your student code').fill(code);
  await page.getByRole('button', { name: 'Open practice paper' }).click();
}

export async function drawStroke(page: Page, area: Locator, offset = 0) {
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await area.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width * .2, box.y + 20 + offset);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .3, box.y + 40 + offset, { steps: 6 });
  await page.mouse.move(box.x + box.width * .4, box.y + 20 + offset, { steps: 6 });
  await page.mouse.up();
}
