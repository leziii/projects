import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E7-2: the order details page shows everything about one order, with money and refund kept apart.
test('order details: visits, money, address; withdraw there shows the refund and Book again', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);

  // R31-1: from the result page.
  await mobileSession(page, r.token, `/pages/orders/result?id=${order.id}`);
  await page.locator('[data-test=view-order]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/detail\\?id=${order.id}`));
  await expect(page.locator('[data-test=order-number]')).toHaveText(order.number);
  await expect(page.locator('[data-test=order-tag]')).toHaveText('Waiting');
  await expect(page.locator('[data-test=order-caregiver]')).toHaveText('Caregiver: Lim M.');
  await expect(page.locator('[data-test=order-status]')).toHaveText(/^Lim M\. has .* left to accept/);
  await expect(page.locator('[data-test=visit]')).toHaveCount(1);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Waiting for caregiver');
  await expect(page.locator('[data-test=visit-price]')).toHaveText(/ min · paid RM40$/);
  await expect(page.locator('[data-test=order-pets]')).toHaveText('For Mimi');
  await expect(page.locator('[data-test=order-paid]')).toHaveText('RM40');
  await expect(page.locator('[data-test=refund]')).toHaveCount(0);
  await expect(page.locator('[data-test=order-address]')).toHaveText('A-3-1, 12 Jalan Telawi, 59100 Bangsar');
  await expect(page.locator('[data-test=order-entry]')).not.toBeEmpty();
  await expect(page.locator('[data-test=help-button]')).toContainText('Help with this order');
  await expect(page.locator('[data-test=rebook]')).toHaveCount(0);

  // R31-5: withdraw here; the refund gets its own row.
  await page.locator('[data-test=withdraw]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=order-tag]')).toHaveText('Withdrawn');
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Not going ahead');
  await expect(page.locator('[data-test=refund-line]')).toHaveText(/^(Refunded|Refund on its way) RM40$/);
  await expect(page.locator('[data-test=withdraw]')).toHaveCount(0);
  await page.locator('[data-test=rebook]').click();
  await expect(page).toHaveURL(/pages\/booking\/index/);
});

// R31-1: an order message opens the details.
test('an order message opens the order details', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  await mobileSession(page, r.token, '/pages/messages/index');
  await page.locator('[data-test=message]', { hasText: 'Payment received' }).click();
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/detail\\?id=${order.id}`));
  await expect(page.locator('[data-test=order-number]')).toHaveText(order.number);
});
