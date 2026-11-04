import { expect, test, type APIRequestContext } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

/** The owner pays with the mock gateway; the order becomes a request for the caregiver. */
async function pay(request: APIRequestContext, headers: Record<string, string>) {
  const res = await request.post(`${API}/bookings/draft/pay`, { headers, data: { healthConfirmed: true, method: 'tng' } });
  expect(res.ok()).toBe(true);
  const { order, paymentId } = await res.json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  return order as { id: number; number: string };
}

// E6-1: the chosen caregiver sees the request on S01 and S06 with its deadline, area and income; tapping opens the detail.
test('the caregiver sees a paid booking as a request, opens it, and it moves to History when it expires', async ({ page, browser, request }) => {
  const { headers, caregiver } = await readyToPay(request, browser, true);
  const order = await pay(request, headers);
  expect((await request.post(`${API}/auth/role`, { headers: caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);

  await mobileSession(page, caregiver.token, '/pages/caregiver/index');
  await expect(page.locator('[data-test=requests-title]')).toHaveText('Waiting for you (1)');
  await expect(page.locator('[data-test=top-tag]')).toHaveText('Normal');
  await expect(page.locator('[data-test=top-left]')).toHaveText(/^(2 h 5\d|3 h 0) min left$/);
  await expect(page.locator('[data-test=top-request]')).toContainText('Bangsar · 1 cat · You earn RM34');
  await expect(page.locator('[data-test=top-request]')).not.toContainText('Telawi');

  await page.locator('[data-test=see-all]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/requests/);
  const card = page.locator('[data-test=request]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-test=request-visits]')).toContainText('· 1 visit');
  await expect(card.locator('[data-test=request-where]')).toHaveText('Bangsar · 1 cat');
  await expect(card.locator('[data-test=request-income]')).toHaveText('You earn RM34');
  await expect(page.locator('[data-test=no-history]')).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(new RegExp(`/pages/caregiver/request\\?id=${order.id}`));
  await expect(page.locator('[data-test=detail-number]')).toHaveText(`Request ${order.number}`);
  await expect(page.locator('[data-test=detail-pet]')).toHaveText('Mimi · Cat');
  await expect(page.locator('[data-test=detail-visit]')).toHaveCount(1);
  await expect(page.locator('[data-test=detail-income]')).toHaveText('RM34');
  await expect(page.locator('[data-test=accept]')).toBeVisible();

  // The deadline passes (dev shortcut): the request moves to History as Expired (R25-5).
  expect((await request.post(`${API}/dev/request-expire`, { data: { number: order.number } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=detail-left]')).toHaveText('Expired');
  await expect(page.locator('[data-test=detail-next]')).toHaveText('This request can no longer be accepted.');
  await page.goto(`${MOBILE}/pages/caregiver/requests`);
  await expect(page.locator('[data-test=request]')).toHaveCount(0);
  await expect(page.locator('[data-test=history-title]')).toHaveText(`${order.number} · Expired`);
});

test('the request alert opens the request from Messages', async ({ page, browser, request }) => {
  const { headers, caregiver } = await readyToPay(request, browser, true);
  const order = await pay(request, headers);
  expect((await request.post(`${API}/auth/role`, { headers: caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  await mobileSession(page, caregiver.token, '/pages/messages/index');
  await page.locator('[data-test=message]', { hasText: 'New booking request' }).first().click();
  await expect(page.locator('[data-test=latest]')).toContainText(`Request ${order.number}: Waiting for you`);
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(new RegExp(`/pages/caregiver/request\\?id=${order.id}`));
});
