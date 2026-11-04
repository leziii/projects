import { expect, test } from '@playwright/test';
import { ADMIN, API, MOBILE, adminSession, loginOnMobile } from './helpers';

// E2-3: messages link to the latest state; the role is checked before opening; no address in the text.
test('message centre: badge, latest state, switch role to open, no address', async ({ page, browser, request }) => {
  const phone = await loginOnMobile(page);
  await expect(page.locator('[data-test=messages-link]')).toBeVisible();
  await expect(page.locator('[data-test=unread]')).toHaveCount(0);

  // Admin sends a message from Test tools; an address is refused.
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=msg-phone]').fill(phone.typed);
  await admin.locator('textarea[data-test=msg-body]').fill('Your caregiver will come to 12 Jalan Ampang.');
  await admin.locator('[data-test=msg-send]').click();
  await expect(admin.locator('.el-message--error')).toContainText('Messages must not contain an address');
  await admin.locator('textarea[data-test=msg-body]').fill('Your caregiver accepted the booking (3 visits).');
  await admin.locator('[data-test=msg-send]').click();
  await expect(admin.getByText(/Message #\d+ sent/)).toBeVisible();
  await admin.close();

  // A payment message, then the payment moves on: opening shows the new state.
  const charge = await (await request.post(`${API}/payments/charges`, { headers: header, data: { ref: `e2e-msg-${Date.now()}`, amountSen: 5600, method: 'tng' } })).json();
  const pay = await request.post(`${API}/dev/message`, {
    data: { phone: phone.e164, category: 'refund', title: 'Payment update', body: 'Your RM56 payment is being processed.', linkType: 'payment', linkId: charge.id },
  });
  expect(pay.ok()).toBe(true);
  expect((await request.post(`${API}/mock-gateway/payments/${charge.id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);

  // Approved as caregiver (sends an account message) and a message for the caregiver role.
  expect((await request.post(`${API}/dev/caregiver-status`, { data: { phone: phone.e164, status: 'approved', reason: 'IC checked' } })).ok()).toBe(true);
  const cg = await request.post(`${API}/dev/message`, { data: { phone: phone.e164, role: 'caregiver', category: 'order', title: 'New booking request', body: 'Urgent · 24 min left.' } });
  expect(cg.ok()).toBe(true);

  await page.reload();
  await expect(page.locator('[data-test=unread]')).toHaveText('4');
  await page.locator('[data-test=messages-link]').click();
  await expect(page).toHaveURL(/\/pages\/messages\/index/);
  const rows = page.locator('[data-test=message]');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('New booking request');
  await expect(rows.nth(0).locator('[data-test=role-tag]')).toHaveText('Caregiver');
  await expect(rows.nth(0).locator('[data-test=action]')).toHaveText('Switch to Caregiver and view ›');
  await expect(rows.nth(1)).toContainText('You are a PawPal caregiver');

  // Tabs filter by category.
  await page.locator('[data-test=tab-refund]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Payment update');

  // The message said "being processed"; opening shows the payment as it is now.
  await rows.first().click();
  await expect(page.locator('[data-test=title]')).toHaveText('Payment update');
  await expect(page.locator('[data-test=latest-summary]')).toHaveText('Charge RM56.00 · Succeeded');
  await page.goBack();
  await page.locator('[data-test=tab-all]').click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2).locator('[data-test=unread-dot]')).toHaveCount(0); // opened = read

  // Wrong role: asked to switch first (C04), then brought back to the message.
  await rows.nth(0).click();
  await expect(page.locator('[data-test=need-role]')).toContainText('This message is for the Caregiver role');
  await expect(page.locator('[data-test=opened]')).toHaveCount(0);
  await page.locator('[data-test=switch-and-view]').click();
  await expect(page).toHaveURL(/\/pages\/role\/index/);
  await expect(page.locator('[data-test=switch]')).toHaveText('Switch to Caregiver');
  await page.locator('[data-test=switch]').click();
  await expect(page).toHaveURL(/\/pages\/messages\/view/);
  await expect(page.locator('[data-test=title]')).toHaveText('New booking request');

  // Mark all read clears the badge.
  await page.goto(`${MOBILE}/pages/messages/index`);
  await page.locator('[data-test=read-all]').click();
  await expect(page.locator('[data-test=unread-dot]')).toHaveCount(0);
  await page.goto(`${MOBILE}/pages/caregiver/index`);
  await expect(page.locator('[data-test=messages-link]')).toBeVisible();
  await expect(page.locator('[data-test=unread]')).toHaveCount(0);
});

test('a guest is sent to log in first, then back to the messages', async ({ page }) => {
  await loginOnMobile(page, '/pages/messages/index');
  await expect(page.locator('[data-test=empty]')).toHaveText('No messages yet.');
});
