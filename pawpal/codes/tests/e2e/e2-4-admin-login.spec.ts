import { expect, test, type Page } from '@playwright/test';
import { ADMIN, ADMIN_PASSWORD, adminCode, adminSession, loginOnMobile, newAdmin } from './helpers';

// E2-4: the admin console has its own accounts (password + authenticator code) and per-page permissions.
async function fillLogin(page: Page, username: string, password: string, code: string) {
  await page.locator('input[data-test=username]').fill(username);
  await page.locator('input[data-test=password]').fill(password);
  await page.locator('input[data-test=code]').fill(code);
  await page.locator('[data-test=login]').click();
}

test('admin logs in with password and code, comes back to the page, logs out', async ({ page, request }) => {
  const username = await newAdmin(request);
  await page.goto(`${ADMIN}/payments`);
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)payments$/);
  await expect(page.locator('[data-test=menu]')).toHaveCount(0);

  await fillLogin(page, username, ADMIN_PASSWORD, await adminCode(request, username));
  await expect(page).toHaveURL(/\/payments$/);
  await expect(page.locator('[data-test=admin-name]')).toHaveText('E2E Admin');
  await expect(page.locator('[data-test=menu] .el-menu-item')).toHaveText(['Dashboard', 'Caregiver review', 'Pet check', 'Rules', 'Promo codes', 'Payments (test)', 'Location flags', 'Cases', 'Reviews', 'Test tools']);

  await page.reload(); // still logged in
  await expect(page.locator('[data-test=new-charge]')).toBeVisible();

  await page.locator('[data-test=logout]').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`${ADMIN}/rules`);
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)rules$/);
});

test('wrong details get one plain message; an app account cannot log in', async ({ page, request }) => {
  const username = await newAdmin(request);
  await page.goto(`${ADMIN}/login`);
  await fillLogin(page, username, ADMIN_PASSWORD, '000000');
  await expect(page.locator('[data-test=login-error]')).toContainText('Wrong username, password or code');

  const phone = await loginOnMobile(await page.context().newPage());
  await fillLogin(page, phone.e164, ADMIN_PASSWORD, '123456');
  await expect(page.locator('[data-test=login-error]')).toContainText('Wrong username, password or code');
  await expect(page).toHaveURL(/\/login$/);
});

test('five wrong tries lock the account', async ({ page, request }) => {
  const username = await newAdmin(request);
  await page.goto(`${ADMIN}/login`);
  for (let i = 0; i < 4; i++) {
    await fillLogin(page, username, 'wrong-pass-1', '000000');
    await expect(page.locator('[data-test=login-error]')).toContainText('Wrong username');
  }
  await fillLogin(page, username, 'wrong-pass-1', '000000');
  await expect(page.locator('[data-test=login-error]')).toContainText('Too many wrong tries. Try again in 15 minutes');
  await fillLogin(page, username, ADMIN_PASSWORD, await adminCode(request, username));
  await expect(page.locator('[data-test=login-error]')).toContainText('Too many wrong tries');
});

test('a page without permission is blocked', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(/\/no-access\?page=dashboard$/);
  await expect(page.locator('[data-test=menu] .el-menu-item')).toHaveText(['Rules']);
  await page.locator('[data-test=menu-rules]').click();
  await expect(page).toHaveURL(/\/rules$/);
  await page.goto(`${ADMIN}/payments`);
  await expect(page.locator('[data-test=no-access]')).toContainText('You have no access to Payments (test).');
});
