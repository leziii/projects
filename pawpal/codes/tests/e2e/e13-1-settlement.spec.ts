import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

// E13-1 R53-1 … R53-4, R53-6: not ready until the visit is final; then one payout of 85%; paid once the bank says so.
test('Test tools finish and settle an order; the caregiver is paid once', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=settle-number]').fill(order.number);
  await admin.locator('[data-test=settle-run]').click();
  await expect(admin.locator('.el-message')).toContainText('Not ready to settle: Visit 1 is not final yet');
  await expect(admin.locator('[data-test=settle-result]')).toHaveCount(0);

  await admin.locator('[data-test=finish-run]').click();
  await expect(admin.locator('.el-message', { hasText: 'visit(s) finished' })).toContainText(`Order ${order.number}: 1 visit(s) finished`);
  await admin.locator('[data-test=settle-run]').click();
  await expect(admin.locator('[data-test=settle-state]')).toHaveText('Paying · RM34 to the caregiver');
  await expect(admin.locator('[data-test=settle-line]')).toHaveText(['Visit 1 service · RM40 → RM34']);

  // R53-4: once only; the bank says paid.
  await admin.locator('[data-test=settle-run]').click();
  await expect(admin.locator('[data-test=settle-state]')).toHaveText('Paying · RM34 to the caregiver');
  const payouts = ((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).filter((p) => p.ref === `order-${order.id}-payout`);
  expect(payouts).toHaveLength(1);
  expect((await request.post(`${API}/mock-gateway/payments/${payouts[0].id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  await admin.locator('[data-test=settle-run]').click();
  await expect(admin.locator('[data-test=settle-state]')).toHaveText('Paid · RM34 to the caregiver');
  await admin.close();

  // The caregiver is told.
  await mobileSession(page, r.caregiver.token, '/pages/messages/index');
  await expect(page.locator('body')).toContainText('Payout on its way: RM34');
  await expect(page.locator('body')).toContainText('Paid: RM34');
});
