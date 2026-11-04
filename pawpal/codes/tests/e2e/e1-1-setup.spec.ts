import { expect, test } from '@playwright/test';
import { adminSession } from './helpers';

// E1-1: all parts run together and the apps can reach the server.
test('server health is ok', async ({ request }) => {
  const res = await request.get('http://localhost:3000/api/health');
  expect(await res.json()).toMatchObject({ status: 'ok', database: 'up', redis: 'up' });
});

test('admin dashboard shows server is healthy', async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto('http://localhost:5173/');
  await expect(page.getByText('PawPal Admin')).toBeVisible();
  await expect(page.locator('[data-test=health]')).toHaveText('All systems OK');
});

test('mobile home shows server is healthy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('http://localhost:5174/');
  await expect(page.getByText('Home pet care · Kuala Lumpur')).toBeVisible();
  await expect(page.getByText('All systems OK')).toBeVisible();
});
