import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E7-3: a visit opens its own page with the plan, price and later parts waiting for the visit.
test('visit details show time, service, entry and price; later parts wait for the visit', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);

  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await page.locator('[data-test=visit]').first().click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/visit\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Waiting for caregiver');
  await expect(page.locator('[data-test=visit-service]')).toHaveText(`Basic care · cats · ${order.number}`);
  await expect(page.locator('[data-test=visit-planned]')).toHaveText(/^10:00 – 10:\d\d am$/);
  await expect(page.locator('[data-test=visit-caregiver]')).toHaveText('Lim M.');
  await expect(page.locator('[data-test=visit-entry]')).toHaveText('Live confirm');
  for (const later of ['visit-actual', 'visit-handover', 'visit-report']) await expect(page.locator(`[data-test=${later}]`)).toHaveText('After the visit');
  await expect(page.locator('[data-test=visit-fee]').first()).toContainText('Base price');
  await expect(page.locator('[data-test=visit-paid]')).toHaveText('RM40');
  await expect(page.locator('[data-test=help-button]')).toContainText('Help with this visit');

  // R32-4: the status follows the order.
  expect((await request.post(`${API}/orders/${order.id}/withdraw`, { headers: r.headers })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Not going ahead');
});
