import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { approvedCaregiver } from './caregiver-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

/** A two-visit order whose caregiver says they can't do visit 1, and a second caregiver free at those times. */
async function setup(request: APIRequestContext, browser: Browser) {
  const { r, order } = await booked(request, browser, true);
  const p = await request.post(`${API}/caregiver/tasks/${order.id}/0/problem`, { headers: r.caregiver.headers, data: { kind: 'cannot_serve', description: 'I am unwell this week' } });
  expect(p.ok()).toBe(true);
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  const cg2 = await approvedCaregiver(request, header, `Nur ${Math.floor(Math.random() * 1e5)} Aina`);
  return { r, order, admin, header, cg2 };
}

// E12-4 R52-1 … R52-4: admin picks visits, times and a free caregiver; nothing moves until the owner approves on O20.
test('admin offers a substitute; the owner approves on O20; the visits move to a new order', async ({ page, browser, request }) => {
  const { r, order, admin, cg2 } = await setup(request, browser);
  await admin.setViewportSize({ width: 1400, height: 900 });
  await admin.goto(`${ADMIN}/exceptions/${order.id}/0`);
  await admin.locator('[data-test=fault-substitute]').click();
  await expect(admin.locator('[data-test=submit-decision]')).toHaveCount(0);
  await expect(admin.locator('[data-test=sub-pick-0] input')).toBeChecked();
  await expect(admin.locator('[data-test=sub-pick-1] input')).not.toBeChecked();
  await admin.locator('[data-test=sub-pick-1]').click();
  // R52-1: the time may move within the same day.
  await admin.locator('[data-test=sub-start-0]').click();
  await admin.locator('.el-select-dropdown__item:visible', { hasText: /^11:00 am$/ }).click();
  await expect(admin.locator('[data-test=sub-hint]')).toHaveText('Find caregivers for the visits you chose');
  await admin.locator('[data-test=find-caregivers]').click();
  await expect(admin.locator('[data-test=candidates]')).toBeVisible();
  await expect(admin.locator(`[data-test=candidate-${r.caregiverId}]`)).toHaveCount(0);
  await admin.locator(`[data-test=candidate-${cg2.id}]`).click();
  await expect(admin.locator('[data-test=sub-hint]')).toHaveText('Write the reason for the owner');
  await expect(admin.locator('[data-test=send-substitute]')).toBeDisabled();
  await admin.locator('textarea[data-test=sub-reason]').fill('Your caregiver is unwell this week');
  await expect(admin.locator('[data-test=sub-hint]')).toHaveText('The owner has 12 hours to approve. Nothing changes until then.');
  await admin.locator('[data-test=send-substitute]').click();

  await expect(admin.locator('[data-test=sub-status]')).toHaveText('Waiting for the owner');
  await expect(admin.locator('[data-test=sub-line]')).toHaveText([/^Visit 1 · .+ · 10:00 am → 11:00 am$/, /^Visit 2 · .+ · 10:00 am \(same time\)$/]);
  await expect(admin.locator('[data-test=sub-answer-by]')).toContainText('Owner answers by');
  await expect(admin.locator('[data-test=decide]')).toHaveCount(0);
  await admin.goto(`${ADMIN}/exceptions`);
  const tag = admin.locator('[data-test=exceptions] .el-table__row', { hasText: order.number }).locator('.el-tag');
  await expect(tag).toHaveText('Substitute offered');

  // R52-3: the owner sees the offer on the order and on O20.
  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=substitute-summary]')).toHaveText(/ can take visits 1, 2\. Answer by \d{1,2}:\d\d [ap]m, /);
  await page.locator('[data-test=open-substitute]').click();
  await expect(page).toHaveURL(/pages\/orders\/substitute\?id=/);
  await expect(page.locator('[data-test=sub-problem]')).toHaveText(/^What happened: Can't do the service \(.+\)$/);
  await expect(page.locator('[data-test=sub-reason]')).toHaveText('Your caregiver is unwell this week');
  await expect(page.locator('[data-test=sub-verified]')).toHaveText('ID verified');
  await expect(page.locator('[data-test=sub-visit]')).toHaveText([/^Visit 1 · .+ · 10:00 am → 11:00 am$/, /^Visit 2 · .+ \(same time\)$/]);
  await expect(page.locator('[data-test=sub-price]')).toHaveText('Price unchanged, nothing to pay.');
  await page.locator('[data-test=approve-substitute]').click();
  await expect(page.locator('[data-test=sub-status]')).toHaveText('Approved');

  // R52-4: the visits are on a new order with the new caregiver; the old order shows them moved.
  await page.locator('[data-test=open-new-order]').click();
  await expect(page.locator('[data-test=substitute-of]')).toHaveText(`Substitute for order ${order.number} · paid on that order`);
  await expect(page.locator('[data-test=visit-when]')).toHaveText([/11:00 am/, /10:00 am/]);
  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText(['Moved to substitute', 'Moved to substitute']);
  await expect(page.locator('[data-test=substitute-card]')).toHaveCount(0);

  await admin.goto(`${ADMIN}/exceptions`);
  await expect(tag).toHaveText('Substitute approved');
  await admin.close();
});

// R52-5: decline means those visits are refunded in full.
test('the owner declines the substitute; the visits are refunded in full', async ({ page, browser, request }) => {
  const { r, order, admin, header, cg2 } = await setup(request, browser);
  await admin.close();
  const sent = await request.post(`${API}/admin/exceptions/${order.id}/0/substitute`, { headers: header, data: { caregiverId: cg2.id, visits: [{ index: 0, start: 600 }], reason: 'Your caregiver is unwell' } });
  expect(sent.ok()).toBe(true);
  await mobileSession(page, r.token, `/pages/orders/substitute?id=${order.id}`);
  await expect(page.locator('[data-test=sub-answer-by]')).toHaveText(/^Please answer by .+\. If you don't, we refund these visits in full\.$/);
  await page.locator('[data-test=decline-substitute]').click();
  await expect(page.locator('.uni-modal')).toContainText('These visits will be cancelled and refunded in full.');
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=sub-status]')).toHaveText('Declined · refunded');
  await mobileSession(page, r.token, `/pages/orders/refunds?id=${order.id}`);
  await expect(page.locator('body')).toContainText('Visit 1: problem decision');
});
