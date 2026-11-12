import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E10-2 R43-1, R43-2: one ticked visit can no longer be cancelled; the other still goes ahead.
test('per-visit results: one cancelled, one not with the reason in red', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, true);
  await mobileSession(page, r.token, `/pages/orders/cancel?id=${order.id}`);
  await page.locator('[data-test=line-0]').click();
  await page.locator('[data-test=line-1]').click();
  await expect(page.locator('[data-test=cancel-submit]')).toHaveText('Cancel 2 visits');

  // Meanwhile visit 1 is cancelled elsewhere (another phone).
  expect((await request.post(`${API}/orders/${order.id}/cancel`, { headers: r.headers, data: { visits: [0], percents: [100] } })).ok()).toBe(true);
  await page.locator('[data-test=cancel-submit]').click();
  await page.locator('.uni-modal__btn_primary').click();

  await expect(page.locator('[data-test=result-title]')).toHaveText('Visit cancelled, 1 not');
  await expect(page.locator('[data-test=result-text-0]')).toHaveText('Not cancelled: it was already cancelled');
  await expect(page.locator('[data-test=result-text-1]')).toHaveText('Cancelled · RM40 back');
  await expect(page.locator('[data-test=result-line]').first()).toHaveClass(/bad/);
  await expect(page.locator('[data-test=result-line]').nth(1)).toHaveClass(/ok/);
  const red = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pp-danger').trim());
  const probe = await page.evaluate((c) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, red);
  expect(await page.locator('[data-test=result-line]').first().evaluate((el) => getComputedStyle(el).color)).toBe(probe);
  await expect(page.locator('[data-test=result-split]')).toHaveText('RM40 back to how you paid');
  await expect(page.locator('[data-test=order-cancelled]')).toBeVisible();
  // KF hand test: on the cancelled order each visit says Cancelled, and the refund is not called "in full".
  await page.locator('[data-test=back-to-order]').click();
  await expect(page.locator('[data-test=visit-status]')).toHaveText(['Cancelled', 'Cancelled']);
  await expect(page.locator('[data-test=order-status]')).toHaveText('You cancelled every visit. RM80 is refunded.');
});
