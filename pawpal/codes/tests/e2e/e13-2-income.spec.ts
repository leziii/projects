import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, adminSession, mobileSession } from './helpers';

// E13-2 R54-1 … R54-4: dashboard → S15; pending, paying and paid kept apart; no withdraw button.
test('caregiver income shows pending, then paying, then paid this month', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  await mobileSession(page, r.caregiver.token, '/pages/caregiver/index');
  await page.locator('[data-test=income-card]').click();
  await expect(page).toHaveURL(/pages\/caregiver\/income/);
  await expect(page.locator('[data-test=pending]')).toHaveText('RM34');
  await expect(page.locator('[data-test=frozen]')).toHaveText('RM0');
  await expect(page.locator('[data-test=paying]')).toHaveText('RM0');
  await expect(page.locator('[data-test=paid]')).toHaveText('RM0');
  const row = page.locator(`[data-test=income-${order.number}]`);
  await expect(row.locator('[data-test=income-state]')).toHaveText('Pending');
  await expect(row.locator('[data-test=income-visits]')).toHaveText('1 visit');
  await expect(row.locator('[data-test=income-amount]')).toHaveText('RM34 ›');
  await expect(page.locator('[data-test=income-note]')).toHaveText('Expected income is not a balance you can withdraw. Paying is not yet paid.');
  await expect(page.getByText(/withdraw/i)).toHaveCount(1);

  // Settled: paying, then paid once the bank says so.
  expect((await request.post(`${API}/dev/order-finish`, { data: { number: order.number } })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/order-settled`, { data: { number: order.number } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=pending]')).toHaveText('RM0');
  await expect(page.locator('[data-test=paying]')).toHaveText('RM34');
  await expect(row.locator('[data-test=income-state]')).toHaveText('Paying');
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.close();
  const payout = ((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).find((p) => p.ref === `order-${order.id}-payout`)!;
  expect((await request.post(`${API}/mock-gateway/payments/${payout.id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=paying]')).toHaveText('RM0');
  await expect(page.locator('[data-test=paid]')).toHaveText('RM34');
  await expect(row.locator('[data-test=income-state]')).toHaveText('Paid');

  // R54-1: also from Me.
  await mobileSession(page, r.caregiver.token, '/pages/me/index');
  await page.locator('[data-test=item-E13-2]').click();
  await expect(page).toHaveURL(/pages\/caregiver\/income/);
});
