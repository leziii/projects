import { expect, test, type APIRequestContext } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

/** The refund payment with this ref, found through the admin list. */
async function refundId(request: APIRequestContext, header: Record<string, string>, ref: string): Promise<number> {
  const list = (await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[];
  const p = list.find((x) => x.ref === ref);
  expect(p, ref).toBeTruthy();
  return p!.id;
}
const outcome = (request: APIRequestContext, id: number, o: 'success' | 'failure') => request.post(`${API}/mock-gateway/payments/${id}/outcome`, { data: { outcome: o } });

// E10-3 R44-1 … R44-5: O13 Details › opens O16; a failed refund shows "Being processed", is sent again, then "Refunded".
test('track refunds: details from the order, being processed, then refunded with a message', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, true);
  expect((await request.post(`${API}/orders/${order.id}/cancel`, { headers: r.headers, data: { visits: [1], percents: [100] } })).ok()).toBe(true);
  const admin = await adminSession(page, request, ['payments']);
  const ref = `order-${order.id}-refund-v1`;

  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=refund-line]')).toHaveText('Refund on its way RM40');
  await page.locator('[data-test=refund-details]').click();
  await expect(page.locator('[data-test=refund-summary]')).toHaveText('Due RM40 · Refunded RM0 · On its way RM40');
  await expect(page.locator('[data-test=reason-v1]')).toHaveText('Visit 2 cancelled');
  await expect(page.locator('[data-test=amount-v1]')).toHaveText('RM40');
  await expect(page.locator('[data-test=state-v1]')).toHaveText('On its way');
  await expect(page.locator('[data-test=credit-back]')).toHaveCount(0);

  // The bank turns it down: the owner sees "Being processed", never "failed".
  expect((await outcome(request, await refundId(request, admin.header, ref), 'failure')).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=state-v1]')).toHaveText('Being processed');
  await expect(page.locator('body')).not.toContainText(/fail/i);

  // A few minutes later it is sent again and the bank confirms.
  expect((await request.post(`${API}/dev/refunds-retry`, { data: { minutesLater: 4 } })).ok()).toBe(true);
  expect((await outcome(request, await refundId(request, admin.header, `${ref}-r1`), 'success')).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=refund-summary]')).toHaveText('Due RM40 · Refunded RM40 · On its way RM0');
  await expect(page.locator('[data-test=state-v1]')).toHaveText(/^Refunded \d{1,2} [A-Z][a-z]{2}$/);
  const { items } = (await (await request.get(`${API}/messages`, { headers: r.headers })).json()) as { items: { title: string }[] };
  expect(items.map((m) => m.title)).toContain('Refund received: RM40');
});

// R44-4: after 3 failed retries the admin sees the refund on Payments and sends it again.
test('stuck refund: admin sees it on Payments and sends it again', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  expect((await request.post(`${API}/orders/${order.id}/cancel`, { headers: r.headers, data: { visits: [0], percents: [100] } })).ok()).toBe(true);
  const admin = await adminSession(page, request, ['payments']);
  const base = `order-${order.id}-refund-v0`;
  for (const [i, ref] of [base, `${base}-r1`, `${base}-r2`, `${base}-r3`].entries()) {
    if (i) expect((await request.post(`${API}/dev/refunds-retry`, { data: { minutesLater: 4 * i } })).ok()).toBe(true);
    expect((await outcome(request, await refundId(request, admin.header, ref), 'failure')).ok()).toBe(true);
  }

  await page.goto(`${ADMIN}/payments`);
  await expect(page.locator('[data-test=stuck-refunds]')).toContainText(order.number);
  await expect(page.locator('[data-test=stuck-refunds]')).toContainText('Declined by bank (mock)');
  await page.locator(`[data-test=retry-${order.id}-v0]`).click();
  await expect(page.locator('.el-message')).toContainText(`Refund for ${order.number} sent again`);
  await expect(page.locator(`[data-test=retry-${order.id}-v0]`)).toHaveCount(0);
  await refundId(request, admin.header, `${base}-r4`);
});
