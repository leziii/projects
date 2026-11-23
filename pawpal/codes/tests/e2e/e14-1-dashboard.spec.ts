import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession } from './helpers';

// E14-1 R57-1 … R57-4: one card per queue; the count matches the list it opens; only allowed queues.
test('dashboard cards count each queue and open its list', async ({ page, browser, request }) => {
  // A failed payout, so Money failed has at least one.
  const { order } = await booked(request, browser, false);
  await request.post(`${API}/dev/order-finish`, { data: { number: order.number } });
  await request.post(`${API}/dev/order-settled`, { data: { number: order.number } });
  const { header } = await adminSession(page, request);
  const payout = ((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).find((p) => p.ref === `order-${order.id}-payout`)!;
  expect((await request.post(`${API}/mock-gateway/payments/${payout.id}/outcome`, { data: { outcome: 'failure' } })).ok()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ADMIN}/`);
  await expect(page.locator('[data-test=dashboard-note]')).toHaveText('Normal orders run on their own. Only these queues need you.');
  await expect(page.locator('[data-test=queues] .card')).toHaveCount(6);
  await expect(page.locator('[data-test=queues] .label')).toHaveText(['Caregivers to review', 'Pets to check', 'Exceptions open', 'Cases open', 'Money failed', 'Money processing over 30 min']);
  const failed = page.locator('[data-test=queue-money_failed]');
  await expect(failed).toHaveClass(/danger/);
  const n = Number(await page.locator('[data-test=queue-count-money_failed]').textContent());
  expect(n).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-test=queue-text-money_failed]')).toHaveText(`${n} waiting`);

  // R57-2: the card opens the list with the same rows.
  await failed.click();
  await expect(page).toHaveURL(/\/money\?tab=failed$/);
  await expect(page.locator('[data-test=money-tab-failed]')).toHaveText(new RegExp(`^Failed \\((${n}|${n + 1}|${n + 2})\\)$`));
  await expect(page.locator('[data-test=money-tab-failed] input')).toBeChecked();
  await expect(page.locator('[data-test=money] .el-table__row', { hasText: order.number })).toBeVisible();

  // R57-3: only the queues of pages this admin may open.
  const other = await browser.newPage();
  await adminSession(other, request, ['dashboard', 'pets']);
  await other.goto(`${ADMIN}/`);
  await expect(other.locator('[data-test=queues] .label')).toHaveText(['Pets to check']);
  await other.close();
});
