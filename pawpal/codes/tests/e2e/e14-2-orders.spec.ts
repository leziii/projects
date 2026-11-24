import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession } from './helpers';

// E14-2 R58-1 … R58-4: find an order by booking and money state, open it, see its visits and record, show the address.
test('admin finds an order with separate booking and money filters and opens it', async ({ page, browser, request }) => {
  const { order } = await booked(request, browser, false);
  await request.post(`${API}/dev/order-finish`, { data: { number: order.number } });
  await request.post(`${API}/dev/order-settled`, { data: { number: order.number } });
  const { header } = await adminSession(page, request, ['orders', 'money', 'payments']);
  const payout = ((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).find((p) => p.ref === `order-${order.id}-payout`)!;
  expect((await request.post(`${API}/mock-gateway/payments/${payout.id}/outcome`, { data: { outcome: 'failure' } })).ok()).toBe(true);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${ADMIN}/orders`);
  await expect(page.locator('[data-test=orders] .el-table__row').first()).toBeVisible();
  // R58-2: booking Done and money Payout failed, together, plus the order number.
  await page.locator('[data-test=filter-booking]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Done$/ }).click();
  await page.locator('[data-test=filter-money]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Payout failed$/ }).click();
  await page.locator('input[data-test=filter-q]').fill(order.number);
  await page.locator('[data-test=order-search]').click();
  const row = page.locator('[data-test=orders] .el-table__row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(order.number);
  await expect(row).toContainText('1 visit');
  await expect(row).toContainText(/\+60 1\d-\*\*\* \d{4}/);
  await expect(page.locator(`[data-test=booking-${order.id}]`)).toHaveText('Done');
  await expect(page.locator(`[data-test=money-${order.id}]`)).toHaveText('Payout failed');
  // Booking Cancelled with the same money filter finds nothing.
  await page.locator('[data-test=filter-booking]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Cancelled$/ }).click();
  await expect(page.locator('[data-test=order-total]')).toHaveText('0 orders');
  await page.locator('[data-test=filter-booking]').click();
  await page.locator('.el-select-dropdown__item:visible', { hasText: /^Done$/ }).click();
  await expect(row).toHaveCount(1);

  // R58-3: the detail.
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.locator('[data-test=order-title]')).toHaveText(`Order ${order.number}`);
  await expect(page.locator('[data-test=order-paid]')).toHaveText('RM40');
  await expect(page.locator('[data-test=visit-status]')).toHaveText(['Confirmed']);
  await expect(page.locator('[data-test=order-log-line]').filter({ hasText: 'Settled: RM34' })).toHaveCount(1);
  await expect(page.locator('[data-test=order-address]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Jalan');

  // R58-4: shown on request and recorded.
  await page.locator('[data-test=show-address]').click();
  await expect(page.locator('[data-test=order-address]')).toBeVisible();
  await expect(page.locator('[data-test=order-log-line]').last()).toHaveText(/^Admin \(.+\): Address and entry notes shown$/);

  // The payout link opens the money item.
  await page.locator('[data-test=order-payout]').click();
  await expect(page).toHaveURL(new RegExp(`/money/order-${order.id}-payout$`));
});
