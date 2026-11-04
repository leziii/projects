import { expect, test, type APIRequestContext } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

async function paidRequest(request: APIRequestContext, browser: import('@playwright/test').Browser) {
  const r = await readyToPay(request, browser, true);
  const res = await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } });
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  return { ...r, order: order as { id: number; number: string } };
}

// E6-2: the caregiver accepts the whole order; the address shows and the owner sees Booked.
test('caregiver accepts the whole order, then sees the address; the owner sees Booked', async ({ page, browser, request }) => {
  const { token, caregiver, order } = await paidRequest(request, browser);
  await mobileSession(page, caregiver.token, `/pages/caregiver/request?id=${order.id}`);
  await expect(page.locator('[data-test=detail-address]')).toHaveCount(0);
  await page.locator('[data-test=accept]').click();
  await expect(page.locator('[data-test=detail-left]')).toHaveText('Accepted');
  await expect(page.locator('[data-test=address-street]')).toContainText('A-3-1, 12 Jalan Telawi, 59100 Bangsar');
  await expect(page.locator('[data-test=address-contact]')).toHaveText('Contact: Ali · +60123456789');
  await expect(page.locator('[data-test=detail-next]')).toHaveText('You accepted this order. The visits are in your schedule.');
  await expect(page.locator('[data-test=accept]')).toHaveCount(0);

  const owner = await browser.newPage();
  await mobileSession(owner, token, `/pages/orders/result?id=${order.id}`);
  await expect(owner.locator('[data-test=result-title]')).toHaveText('Booked');
  await owner.close();
});

// R26-1, R26-5: a clash refuses Accept and says which visit; saying no needs a reason and refunds the owner in full.
test('a clashing visit blocks Accept; saying no with a reason refunds the owner, who never sees the reason', async ({ page, browser, request }) => {
  const { token, caregiver, order } = await paidRequest(request, browser);
  const detail = await (await request.get(`${API}/requests/${order.id}`, { headers: caregiver.headers })).json();
  const v = detail.firstVisit as { date: string; start: number };
  expect((await request.post(`${API}/dev/test-visit`, { data: { phone: caregiver.phone.e164, date: v.date, start: v.start, minutes: 30 } })).ok()).toBe(true);

  await mobileSession(page, caregiver.token, `/pages/caregiver/request?id=${order.id}`);
  await page.locator('[data-test=accept]').click();
  await expect(page.locator('[data-test=error]')).toContainText('This visit clashes with your schedule:');
  await expect(page.locator('[data-test=detail-left]')).toHaveText(/min left$/);

  await page.locator('[data-test=reject]').click();
  await expect(page.locator('[data-test=reject-confirm]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=reason-not_free]').click();
  await page.locator('[data-test=reject-confirm]').click();
  await expect(page.locator('[data-test=detail-left]')).toHaveText('You said no');
  await expect(page.locator('[data-test=detail-next]')).toHaveText('You said no. The owner gets a full refund.');

  await page.goto(`${MOBILE}/pages/caregiver/requests`);
  await expect(page.locator('[data-test=history-title]').first()).toHaveText(`${order.number} · You said no`);

  const owner = await browser.newPage();
  await mobileSession(owner, token, `/pages/orders/result?id=${order.id}`);
  await expect(owner.locator('[data-test=result-title]')).toHaveText('Not accepted');
  await expect(owner.locator('[data-test=result-body]')).toContainText('could not take this booking. RM40 is refunded in full.');
  await expect(owner.locator('body')).not.toContainText('Not free');
  await owner.close();
});
