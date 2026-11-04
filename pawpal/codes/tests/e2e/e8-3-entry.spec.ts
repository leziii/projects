import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { ADMIN, API, MOBILE, adminSession, mobileSession } from './helpers';

const CLOCK = '\\d{1,2}:\\d\\d (am|pm)';

/** A paid, accepted order with the caregiver in the caregiver role. */
async function accepted(request: Parameters<typeof readyToPay>[0], browser: Parameters<typeof readyToPay>[1], method: 'live_confirm' | 'pre_authorised') {
  const r = await readyToPay(request, browser, method === 'live_confirm');
  if (method === 'pre_authorised') {
    expect((await request.post(`${API}/bookings/draft/entry`, { headers: r.headers, data: { method, keyLock: 'Code 4821#', guard: '', notes: '' } })).ok()).toBe(true);
  }
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
  return { r, order: order as { id: number; number: string } };
}

// E8-3 Live confirm: the caregiver arrives, the owner lets them in from O14, the caregiver's page updates by itself.
test('live confirm: arrive, the owner confirms, both see who confirmed', async ({ page, browser, request }) => {
  const { r, order } = await accepted(request, browser, 'live_confirm');

  // R35-7: the admin test tool moves visit 1 to start in 10 minutes.
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=soon-number]').fill(order.number.toLowerCase());
  await admin.locator('[data-test=soon-run]').click();
  await expect(admin.locator('.el-message')).toContainText(new RegExp(`Visit 1 of ${order.number} now starts at ${CLOCK} today`));
  await admin.close();

  await mobileSession(page, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('To do');
  await expect(page.locator('[data-test=arrive-note]')).toHaveText('Tap when you reach the door. Waiting outside is not service time.');
  await page.locator('[data-test=arrive]').click();
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Arrived');
  await expect(page.locator('[data-test=arrived-at]')).toHaveText(new RegExp(`^Arrived ${CLOCK}$`));
  await expect(page.locator('[data-test=waiting-owner]')).toHaveText('Waiting for the owner to confirm');
  await expect(page.locator('[data-test=confirm-entry]')).toHaveCount(0);

  // R35-4, R35-5: the owner confirms on O14.
  const owner = await browser.newPage();
  await mobileSession(owner, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(owner.locator('[data-test=visit-status]')).toHaveText('Caregiver arrived');
  await expect(owner.locator('[data-test=visit-actual]')).toHaveText(new RegExp(`^Arrived ${CLOCK}$`));
  await expect(owner.locator('[data-test=arrived-note]')).toHaveText(/^\S+ \S\. has arrived\. Confirm to let them in\.$/);
  await owner.locator('[data-test=confirm-entry]').click();
  await expect(owner.locator('[data-test=visit-status]')).toHaveText('In service');
  await expect(owner.locator('[data-test=visit-handover]')).toHaveText(new RegExp(`^Entered ${CLOCK} \\(confirmed by you\\)$`));
  await expect(owner.locator('[data-test=confirm-entry]')).toHaveCount(0);
  await owner.goto(`${MOBILE}/pages/orders/detail?id=${order.id}`);
  await expect(owner.locator('[data-test=visit-status]').first()).toHaveText('In service');
  await owner.close();

  // The caregiver's page refreshes by itself.
  await expect(page.locator('[data-test=visit-status]')).toHaveText('In service', { timeout: 15_000 });
  await expect(page.locator('[data-test=entered-at]')).toHaveText(new RegExp(`^Entered ${CLOCK} \\(confirmed by the owner\\)$`));
});

// E8-3 Pre-authorised: the caregiver ticks "I got in" and confirms entry.
test('pre-authorised: arrive, tick and confirm entry; the owner sees it was the caregiver', async ({ page, browser, request }) => {
  const { r, order } = await accepted(request, browser, 'pre_authorised');
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);

  await mobileSession(page, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=arrive]').click();
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Arrived');
  await expect(page.locator('[data-test=waiting-owner]')).toHaveCount(0);
  await expect(page.locator('[data-test=confirm-entry]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=entered-tick]').click();
  await page.locator('[data-test=confirm-entry]').click();
  await expect(page.locator('[data-test=visit-status]')).toHaveText('In service');
  await expect(page.locator('[data-test=entered-at]')).toHaveText(new RegExp(`^Entered ${CLOCK} \\(confirmed by you\\)$`));

  await page.goto(`${MOBILE}/pages/caregiver/tasks`);
  const today = new Date(Date.now() + 8 * 3600_000 + 10 * 60_000).toISOString().slice(0, 10);
  await page.locator(`[data-test=day-${today}]`).click();
  await expect(page.locator('[data-test=task-status]')).toHaveText('In service');

  const owner = await browser.newPage();
  await mobileSession(owner, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(owner.locator('[data-test=visit-handover]')).toHaveText(new RegExp(`^Entered ${CLOCK} \\(confirmed by the caregiver\\)$`));
  await expect(owner.locator('[data-test=confirm-entry]')).toHaveCount(0);
  await owner.close();
});
