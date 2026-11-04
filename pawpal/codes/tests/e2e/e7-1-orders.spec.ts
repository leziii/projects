import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession, newPhone } from './helpers';

// E7-1: the owner finds paid orders under "My orders", newest first, with filters.
test('My orders lists paid orders with tag, line and amount; filters narrow it; a card opens the order', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const pay = async () => {
    const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
    expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
    return order as { id: number; number: string };
  };
  const first = await pay();
  expect((await request.post(`${API}/orders/${first.id}/withdraw`, { headers: r.headers })).ok()).toBe(true);
  // Book again, then pay: a second, waiting order.
  expect((await request.post(`${API}/orders/${first.id}/rebook`, { headers: r.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/caregiver`, { headers: r.headers, data: { caregiverId: r.caregiverId } })).ok()).toBe(true);
  const second = await pay();

  await mobileSession(page, r.token, '/pages/index/index');
  await page.locator('[data-test=my-orders]').click();
  const cards = page.locator('[data-test=order]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('[data-test=order-number]')).toHaveText(`${second.number} · 1 visit`);
  await expect(cards.nth(0).locator('[data-test=order-tag]')).toHaveText('Waiting');
  await expect(cards.nth(0).locator('[data-test=order-line]')).toHaveText(/^Accept by /);
  await expect(cards.nth(0).locator('[data-test=order-paid]')).toHaveText('RM40');
  await expect(cards.nth(1).locator('[data-test=order-tag]')).toHaveText('Withdrawn');
  await expect(cards.nth(1).locator('[data-test=order-line]')).toHaveText('RM40 refunded in full');

  await page.locator('[data-test=filter-ended]').click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('[data-test=order-number]')).toHaveText(`${first.number} · 1 visit`);
  await page.locator('[data-test=filter-booked]').click();
  await expect(page.locator('[data-test=no-orders]')).toBeVisible();
  await page.locator('[data-test=filter-waiting]').click();
  await cards.first().click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/detail\\?id=${second.id}`));
  await expect(page.locator('[data-test=order-number]')).toHaveText(second.number);
});

// R30-6: empty list offers Book now; a failed load offers Retry.
test('no orders yet offers Book now; a load error offers Retry', async ({ page, request }) => {
  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();

  await page.route('**/api/orders?**', (route) => route.abort());
  await mobileSession(page, token, '/pages/orders/index');
  await expect(page.locator('[data-test=load-error]')).toContainText('Could not load your orders');
  await page.unroute('**/api/orders?**');
  await page.locator('[data-test=retry]').click();
  await expect(page.locator('[data-test=no-orders]')).toContainText('No orders yet');
  await page.locator('[data-test=book-now]').click();
  await expect(page).toHaveURL(/pages\/booking\/index/);
});
