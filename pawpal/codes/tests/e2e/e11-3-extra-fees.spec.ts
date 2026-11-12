import { expect, test, type APIRequestContext } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, mobileSession } from './helpers';

type Booked = Awaited<ReturnType<typeof booked>>;

/** A visit in service: due now, arrived, and let in by the owner. */
async function inService(request: APIRequestContext, b: Booked, enter = true) {
  const { r, order } = b;
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/arrive`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);
  if (enter) expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
}

const titles = async (request: APIRequestContext, headers: Record<string, string>) =>
  ((await (await request.get(`${API}/messages`, { headers })).json()) as { items: { title: string }[] }).items.map((m) => m.title);

// E11-3 R47-1, R47-2, R47-5: the order shows the request; O19 → pay page; a failed try can be paid again; then the caregiver may stay.
test('owner approves and pays overtime after a failed try; the caregiver sees it is paid', async ({ page, browser, request }) => {
  const b = await booked(request, browser, false);
  const { r, order } = b;
  await inService(request, b);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/overtime`, { headers: r.caregiver.headers, data: { units: 2 } })).ok()).toBe(true);

  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=extra-fees]')).toContainText('Visit 1 · Overtime: 30 min · RM20');
  await page.locator('[data-test^=extra-]:not([data-test=extra-fees])').filter({ hasText: 'Overtime' }).first().click();
  await expect(page.locator('[data-test=fee-title]')).toHaveText('Overtime: 30 min · RM20');
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Waiting for you');
  await expect(page.locator('[data-test=until]')).toHaveText(/^If you pay, the visit can run until \d{1,2}:\d\d [ap]m\.$/);
  await expect(page.locator('[data-test=fee-pay]')).toHaveText('Approve and pay RM20');

  await page.locator('[data-test=pay-duitnow]').click();
  await page.locator('[data-test=fee-pay]').click();
  await expect(page).toHaveURL(/\/pages\/pay\/test/);
  await expect(page.locator('[data-test=amount]')).toHaveText('RM20');
  await expect(page.locator('[data-test=method]')).toHaveText('DuitNow');
  await page.locator('[data-test=outcome-failure]').click();

  await expect(page).toHaveURL(/\/pages\/orders\/extra/);
  await expect(page.locator('[data-test=fee-failed]')).toHaveText('Payment failed. Try again.');
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Waiting for you');
  await page.locator('[data-test=fee-pay]').click();
  await expect(page).toHaveURL(/\/pages\/pay\/test/);
  await page.locator('[data-test=outcome-success]').click();
  await expect(page).toHaveURL(/\/pages\/orders\/extra/);
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Paid');
  await expect(page.locator('[data-test=fee-pay]')).toHaveCount(0);

  // Back on the order the card is gone; the caregiver is told and S11 / S14 say she may stay.
  await page.locator('[data-test=back-to-order]').click();
  await expect(page.locator('[data-test=extra-fees]')).toHaveCount(0);
  expect(await titles(request, r.caregiver.headers)).toContain('Overtime paid: 30 min · RM20');
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/service?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=overtime-paid]')).toHaveText(/^Owner paid · you may stay until \d{1,2}:\d\d [ap]m$/);
  await page.locator('[data-test=overtime]').click();
  await expect(page.locator('[data-test=open-text]')).toHaveText('Owner paid: 30 min · RM20');
  await expect(page.locator('[data-test=paid-until]')).toHaveText(/^You may stay until \d{1,2}:\d\d [ap]m\.$/);
  await expect(page.locator('[data-test=withdraw]')).toHaveCount(0);
});

// R47-2, R47-4: declining tells the caregiver, who goes back to the booked service only.
test('owner declines overtime', async ({ page, browser, request }) => {
  const b = await booked(request, browser, false);
  const { r, order } = b;
  await inService(request, b);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/overtime`, { headers: r.caregiver.headers, data: { units: 1 } })).ok()).toBe(true);

  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await page.locator('[data-test^=extra-]:not([data-test=extra-fees])').filter({ hasText: 'Overtime' }).first().click();
  await page.locator('[data-test=fee-decline]').click();
  await expect(page.locator('.uni-modal')).toContainText('will finish the booked service only');
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Declined');
  await expect(page.locator('[data-test=fee-pay]')).toHaveCount(0);
  expect(await titles(request, r.caregiver.headers)).toContain('Overtime declined');

  await mobileSession(page, r.caregiver.token, `/pages/caregiver/service?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=overtime]')).toHaveText('Ask for overtime');
  await expect(page.locator('[data-test=overtime-open]')).toHaveCount(0);
});

// R47-3: a waiting request offers prepay RM25 or "Let them in now"; let in within the free time, nothing is paid.
test('owner lets the waiting caregiver in: nothing to pay', async ({ page, browser, request }) => {
  const b = await booked(request, browser, false);
  const { r, order } = b;
  await inService(request, b, false);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/wait`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);

  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=extra-fees]')).toContainText('Visit 1 · Waiting: prepay RM25');
  await page.locator('[data-test^=extra-]:not([data-test=extra-fees])').filter({ hasText: 'Waiting' }).first().click();
  await expect(page.locator('[data-test=fee-title]')).toHaveText('Waiting: prepay RM25');
  await expect(page.locator('[data-test=waiting-now]')).toContainText('is at the door.');
  await expect(page.locator('[data-test=fee-pay]')).toHaveText('Prepay RM25');
  await page.locator('[data-test=let-in]').click();
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Nothing to pay');
  await expect(page.locator('[data-test=let-in]')).toHaveCount(0);
  await page.locator('[data-test=back-to-order]').click();
  await expect(page.locator('[data-test=extra-fees]')).toHaveCount(0);
});
