import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

async function withdrawnOrder(request: APIRequestContext, browser: Browser) {
  const r = await readyToPay(request, browser, true);
  const res = await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } });
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/withdraw`, { headers: r.headers })).ok()).toBe(true);
  return { ...r, order: order as { id: number; number: string } };
}

// E6-5: after a failed or withdrawn order, "Book again" fills the booking; the caregiver is chosen again.
test('Book again copies the old order into the booking and asks for a caregiver', async ({ page, browser, request }) => {
  const { token, order } = await withdrawnOrder(request, browser);
  await mobileSession(page, token, `/pages/orders/result?id=${order.id}`);
  await expect(page.locator('[data-test=result-title]')).toHaveText('Booking withdrawn');
  await page.locator('[data-test=rebook]').click();
  await expect(page).toHaveURL(/pages\/booking\/index/);
  await expect(page.locator('[data-test=caregiver-note]')).toHaveText(`Copied from order ${order.number}. Choose a caregiver again.`);
});

// R29-5: a booking in progress is replaced only after OK.
test('Book again asks before replacing a booking in progress', async ({ page, browser, request }) => {
  const { token, headers, order } = await withdrawnOrder(request, browser);
  expect((await request.post(`${API}/bookings/draft`, { headers, data: { petIds: [], level: 'basic', overtimeUnits: 0, addressId: null, visits: [] } })).ok()).toBe(true);
  await mobileSession(page, token, `/pages/orders/result?id=${order.id}`);
  await page.locator('[data-test=rebook]').click();
  await expect(page.locator('.uni-modal')).toContainText('Replace your current booking?');
  await page.locator('.uni-modal__btn_default').click();
  await expect(page).toHaveURL(/pages\/orders\/result/);
  await page.locator('[data-test=rebook]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page).toHaveURL(/pages\/booking\/index/);
  await expect(page.locator('[data-test=caregiver-note]')).toContainText(`Copied from order ${order.number}.`);
});

// R29-1: not offered while the order is waiting or booked.
test('no Book again while the order is waiting', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const res = await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } });
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  await mobileSession(page, r.token, `/pages/orders/result?id=${order.id}`);
  await expect(page.locator('[data-test=withdraw]')).toBeVisible();
  await expect(page.locator('[data-test=rebook]')).toHaveCount(0);
});
