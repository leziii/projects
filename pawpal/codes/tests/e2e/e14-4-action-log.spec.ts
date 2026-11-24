import { expect, test } from '@playwright/test';
import { ADMIN, API, adminSession } from './helpers';

// E14-4 R60-1 … R60-5: an admin's login and changes show in the Action log with who, what, before → after and why.
test('admin sees their own login and rule change in the Action log, filters it and opens the item', async ({ page, request }) => {
  const { username, header } = await adminSession(page, request, ['rules', 'actions']);
  const tomorrow = new Date(Date.now() + 8 * 3600e3 + 864e5).toISOString().slice(0, 10);
  const saved = await (await request.post(`${API}/admin/rules`, { headers: header, data: { values: { 'price.cat': 4200 }, effectiveFrom: tomorrow, reason: 'Action log test' } })).json();
  const version = saved.waiting.version as string;
  expect((await request.post(`${API}/admin/rules/${version}/withdraw`, { headers: header, data: { reason: 'Action log test done' } })).ok()).toBe(true);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${ADMIN}/`);
  await page.getByRole('menuitem', { name: 'Action log' }).click();
  await expect(page).toHaveURL(/\/actions$/);
  await expect(page.getByText('Nobody can change or delete a row.')).toBeVisible();

  // R60-4: filter by this admin.
  await page.locator('[data-test=filter-admin]').click();
  await page.keyboard.type(username);
  await page.locator('.el-select-dropdown__item:visible', { hasText: username }).click();
  const rows = page.locator('[data-test=actions] .el-table__row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(`Rule version ${version}`);
  await expect(rows.nth(0)).toContainText('waiting → withdrawn');
  await expect(rows.nth(0)).toContainText('Action log test done');
  await expect(rows.nth(1)).toContainText('Action log test');
  await expect(rows.nth(2)).toContainText('Logged in with password and code');
  await expect(page.locator('[data-test=action-total]')).toHaveText('3 actions');

  await page.locator('[data-test=filter-kind]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Logins$/ }).click();
  await expect(rows).toHaveCount(1);
  await page.locator('[data-test=filter-kind]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Rules$/ }).click();
  await expect(rows).toHaveCount(2);

  // Each row opens its item.
  await rows.first().click();
  await expect(page).toHaveURL(/\/rules$/);
});

test('an admin without the page cannot open the Action log (R60-5)', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.goto(`${ADMIN}/actions`);
  await expect(page).toHaveURL(/no-access/);
});
