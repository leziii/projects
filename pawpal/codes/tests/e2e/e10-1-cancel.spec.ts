import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

// E10-1 R42-2, R42-3, R42-5, R42-7: from O13, tick one of two visits; full refund; the caregiver sees it cancelled.
test('owner cancels one of two visits from the order page', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, true);
  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await page.locator('[data-test=cancel-visits]').click();

  await expect(page).toHaveURL(new RegExp(`pages/orders/cancel\\?id=${order.id}`));
  await expect(page.locator('[data-test=line-text-0]')).toHaveText('Full refund RM40');
  await expect(page.locator('[data-test=line-text-1]')).toHaveText('Full refund RM40');
  await expect(page.locator('[data-test=cancel-submit]')).toHaveText('Choose a visit');
  await expect(page.locator('[data-test=cancel-submit]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=line-1]').click();
  await expect(page.locator('[data-test=pick-1]')).toHaveText('☑');
  await expect(page.locator('[data-test=cancel-total]')).toHaveText('RM40');
  await expect(page.locator('[data-test=refund-split]')).toHaveText('RM40 back to how you paid');
  // Cancel in the popup keeps everything.
  await page.locator('[data-test=cancel-submit]').click();
  await expect(page.locator('.uni-modal')).toContainText("Cancel 1 visit? RM40 will be refunded. This can't be undone.");
  await page.locator('.uni-modal__btn_default').click();
  await expect(page.locator('[data-test=cancel-result]')).toHaveCount(0);
  await page.locator('[data-test=cancel-submit]').click();
  await page.locator('.uni-modal__btn_primary').click();

  await expect(page.locator('[data-test=result-line]')).toHaveText([/^✓ Visit 2 · .+Cancelled · RM40 back$/]);
  await expect(page.locator('[data-test=result-split]')).toHaveText('RM40 back to how you paid');
  await expect(page.locator('[data-test=order-cancelled]')).toHaveCount(0);
  await page.locator('[data-test=back-to-order]').click();

  await expect(page).toHaveURL(new RegExp(`pages/orders/detail\\?id=${order.id}`));
  await expect(page.locator('[data-test=visit-status]')).toHaveText(['Booked', 'Cancelled']);
  await expect(page.locator('[data-test=visit-cancelled]')).toHaveText('Cancelled · full refund RM40');
  await expect(page.locator('[data-test=refund-line]')).toContainText('RM40');
  await expect(page.locator('[data-test=cancel-visits]')).toBeVisible(); // visit 1 can still be cancelled

  const cg = await browser.newPage();
  await mobileSession(cg, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=1`);
  await expect(cg.locator('[data-test=visit-status]')).toHaveText('Cancelled');
  await cg.close();
});

// R42-2, R42-4, R42-6: from O14 the visit comes ticked; a time line passing asks again; the last visit cancels the order.
test('a line passing while the page is open asks again; cancelling the only visit cancels the order', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  await mobileSession(page, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=cancel-visit]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/cancel\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=pick-0]')).toHaveText('☑');
  await expect(page.locator('[data-test=cancel-total]')).toHaveText('RM40');

  // The visit is now 10 minutes away (test tool), so the refund drops to 0%.
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  await page.locator('[data-test=cancel-submit]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=amount-changed]')).toHaveText('The refund changed because time passed. Check the new amounts and confirm again.');
  await expect(page.locator('[data-test=line-text-0]')).toHaveText('No refund (under 1 h)');
  await expect(page.locator('[data-test=cancel-total]')).toHaveText('RM0');
  await page.locator('[data-test=cancel-submit]').click();
  await expect(page.locator('.uni-modal')).toContainText("Cancel 1 visit? Nothing will be refunded. This can't be undone.");
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=result-line]')).toHaveText([/Cancelled · no refund$/]);
  await expect(page.locator('[data-test=order-cancelled]')).toBeVisible();

  await page.goto(`${MOBILE}/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=order-tag]')).toHaveText('Cancelled');
  await expect(page.locator('[data-test=order-status]')).toHaveText('You cancelled every visit.');
  await expect(page.locator('[data-test=cancel-visits]')).toHaveCount(0);
});
