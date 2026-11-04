import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

// E6-3: the owner sees a live countdown; when it runs out the order fails with a full refund and both sides are told.
test('owner sees the countdown; at the deadline the order is not accepted and refunded in full', async ({ page, browser, request }) => {
  const { token, headers, caregiver } = await readyToPay(request, browser, true);
  const res = await request.post(`${API}/bookings/draft/pay`, { headers, data: { healthConfirmed: true, method: 'tng' } });
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);

  await mobileSession(page, token, `/pages/orders/result?id=${order.id}`);
  await expect(page.locator('[data-test=result-body]')).toHaveText(/^Lim M\. has (2 h 5\d|3 h 0) min left to accept \(until /);

  // The deadline passes (test tool): failed and refunded at once (R27-5).
  expect((await request.post(`${API}/dev/request-expire`, { data: { number: order.number } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Not accepted');
  await expect(page.locator('[data-test=result-body]')).toHaveText('Lim M. did not answer in time. RM40 is refunded in full. You can book again with another caregiver.');

  // KF hand test: the order number can be copied.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: MOBILE });
  await expect(page.locator('[data-test=copy-number] [data-test=copy-icon]')).toBeVisible();
  await expect(page.locator('[data-test=copy-number]')).toHaveText(order.number);
  await page.locator('[data-test=copy-number]').click();
  await expect(page.getByText('Order number copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(order.number);

  // The caregiver is told, without an address.
  expect((await request.post(`${API}/auth/role`, { headers: caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const cg = await browser.newPage();
  await mobileSession(cg, caregiver.token, '/pages/messages/index');
  await expect(cg.locator('[data-test=message]', { hasText: `Request ${order.number} expired` })).toBeVisible();
  await cg.goto(`${MOBILE}/pages/caregiver/request?id=${order.id}`);
  await expect(cg.locator('[data-test=detail-left]')).toHaveText('Expired');
  await cg.locator('[data-test=copy-number]').click();
  await expect(cg.getByText('Request number copied')).toBeVisible();
  await cg.close();
});
