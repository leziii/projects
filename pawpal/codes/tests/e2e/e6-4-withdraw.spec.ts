import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

async function paidRequest(request: APIRequestContext, browser: Browser) {
  const r = await readyToPay(request, browser, true);
  const res = await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } });
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  return { ...r, order: order as { id: number; number: string } };
}

// E6-4: the owner withdraws a paid order before the caregiver accepts; full refund, and the caregiver is told.
test('owner withdraws after confirming; full refund; the caregiver sees Owner withdrew', async ({ page, browser, request }) => {
  const { token, caregiver, order } = await paidRequest(request, browser);
  await mobileSession(page, token, `/pages/orders/result?id=${order.id}`);
  await expect(page.locator('[data-test=withdraw]')).toHaveText('Withdraw booking');

  // R28-2: Cancel keeps the booking.
  await page.locator('[data-test=withdraw]').click();
  await expect(page.locator('.uni-modal')).toContainText('Withdraw this booking? RM40 will be refunded in full.');
  await page.locator('.uni-modal__btn_default').click();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');

  await page.locator('[data-test=withdraw]').click();
  await expect(page.locator('.uni-modal__btn_primary')).toHaveText('OK');
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Booking withdrawn');
  await expect(page.locator('[data-test=result-body]')).toHaveText('You withdrew this booking. RM40 is refunded in full.');
  await expect(page.locator('[data-test=withdraw]')).toHaveCount(0);

  const cg = await browser.newPage();
  await mobileSession(cg, caregiver.token, '/pages/messages/index');
  await expect(cg.locator('[data-test=message]', { hasText: `Request ${order.number} withdrawn` })).toBeVisible();
  await cg.close();
});

// R28-6: the owner withdrew first, so the caregiver's Accept is refused and the page shows the latest.
test('accept after the owner withdrew is refused', async ({ page, request, browser }) => {
  const { headers, caregiver, order } = await paidRequest(request, browser);
  await mobileSession(page, caregiver.token, `/pages/caregiver/request?id=${order.id}`);
  await expect(page.locator('[data-test=accept]')).toBeVisible();
  expect((await request.post(`${API}/orders/${order.id}/withdraw`, { headers })).ok()).toBe(true);
  await page.locator('[data-test=accept]').click();
  await expect(page.locator('[data-test=error]')).toHaveText('The owner withdrew this request');
  await expect(page.locator('[data-test=detail-left]')).toHaveText('Owner withdrew');
});

// R28-6: the caregiver accepted first, so withdraw is refused and the owner sees Booked.
test('withdraw after the caregiver accepted is refused', async ({ page, request, browser }) => {
  const { token, caregiver, order } = await paidRequest(request, browser);
  await mobileSession(page, token, `/pages/orders/result?id=${order.id}`);
  await expect(page.locator('[data-test=withdraw]')).toBeVisible();
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: caregiver.headers })).ok()).toBe(true);
  await page.locator('[data-test=withdraw]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=error]')).toHaveText('Lim M. already accepted. The booking is confirmed.');
  await expect(page.locator('[data-test=result-title]')).toHaveText('Booked');
  await expect(page.locator('[data-test=withdraw]')).toHaveCount(0);
});
