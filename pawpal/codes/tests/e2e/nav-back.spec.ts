import { expect, test } from '@playwright/test';
import { loginOnMobile } from './helpers';

// Every page that is not a start page has a back arrow, even when it is the first page (e.g. after logging in).
test('Messages opened after login has a back arrow that goes home', async ({ page }) => {
  await loginOnMobile(page, '/pages/messages/index');
  const back = page.locator('.uni-page-head-btn').first();
  await expect(back).toBeVisible();
  await page.reload();
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/localhost:5174\/(#\/)?(pages\/index\/index)?$/);
  await expect(page.locator('.uni-page-head-btn')).toHaveCount(0);
});
