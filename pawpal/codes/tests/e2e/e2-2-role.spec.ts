import { expect, test } from '@playwright/test';
import { ADMIN, MOBILE, adminSession, loginOnMobile } from './helpers';

// E2-2: one account, two roles. Only approved caregivers may switch; switching never changes ownership.
test('unapproved → approved by admin → switch to caregiver and back', async ({ page, browser, request }) => {
  const phone = await loginOnMobile(page);
  await expect(page.locator('[data-test=current-role]')).toHaveText('Owner');
  await expect(page.locator('[data-test=menu-caregiver]')).toHaveCount(0);

  // Not a caregiver yet: the caregiver option is locked and points to the application.
  await page.locator('[data-test=switch-role]').click();
  await expect(page).toHaveURL(/\/pages\/role\/index/);
  await expect(page.locator('[data-test=caregiver-tag]')).toHaveText('Not a caregiver yet');
  await expect(page.locator('[data-test=apply]')).toBeVisible();
  await page.locator('[data-test=pick-caregiver]').click();
  await expect(page.locator('[data-test=switch]')).toHaveText('Switch to Owner');
  await expect(page.locator('[data-test=switch]')).toHaveAttribute('disabled', /.*/);

  // Admin approves the caregiver (test tool until E4-2).
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=cg-phone]').fill(phone.typed);
  await admin.locator('input[data-test=cg-reason]').fill('IC checked, interview passed');
  await admin.locator('[data-test=cg-save]').click();
  await expect(admin.getByText(`${phone.shown} is now: approved`)).toBeVisible();
  await admin.close();

  await page.reload();
  await expect(page.locator('[data-test=caregiver-tag]')).toHaveText('Approved');
  await expect(page.locator('[data-test=apply]')).toHaveCount(0);
  await page.locator('[data-test=pick-caregiver]').click();
  await page.locator('[data-test=switch]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/index/);
  await expect(page.getByText('Caregiver dashboard')).toBeVisible();

  await page.locator('[data-test=account]').click();
  await expect(page.locator('[data-test=current-role]')).toHaveText('Caregiver');
  await expect(page.locator('[data-test=my-phone]')).toHaveText(phone.shown); // same account
  await expect(page.locator('[data-test=menu-caregiver]')).toContainText('Schedule');

  await page.locator('[data-test=switch-role]').click();
  await page.locator('[data-test=pick-owner]').click();
  await page.locator('[data-test=switch]').click();
  await expect(page.locator('[data-test=prices]')).toBeVisible(); // owner home
  await page.goto(`${MOBILE}/pages/me/index`);
  await expect(page.locator('[data-test=current-role]')).toHaveText('Owner');
});

test('a suspended caregiver sees why, and is moved back to owner', async ({ page, request }) => {
  const phone = await loginOnMobile(page);
  const set = (status: string, reason: string) => request.post('http://localhost:3000/api/dev/caregiver-status', { data: { phone: phone.e164, status, reason } });
  expect((await set('approved', 'IC checked, interview passed')).ok()).toBe(true);
  await page.locator('[data-test=switch-role]').click();
  await page.locator('[data-test=pick-caregiver]').click();
  await page.locator('[data-test=switch]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/index/);

  expect((await set('suspended', 'Repeated no-shows')).ok()).toBe(true);
  await page.reload();
  // R25-8 (E6-1): the dashboard shows only why it is paused, with a way back to the owner home.
  await expect(page.locator('[data-test=paused-reason]')).toHaveText('Reason: Repeated no-shows');
  await expect(page.locator('[data-test=requests]')).toHaveCount(0);
  await page.locator('[data-test=owner-home]').click();
  await expect(page.locator('[data-test=prices]')).toBeVisible();
  await page.goto(`${MOBILE}/pages/role/index`);
  await expect(page.locator('[data-test=caregiver-tag]')).toHaveText('Suspended');
  await expect(page.locator('[data-test=paused-reason]')).toHaveText('Your caregiver account is paused: Repeated no-shows');
});
