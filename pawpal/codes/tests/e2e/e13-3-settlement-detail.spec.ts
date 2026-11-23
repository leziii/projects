import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, adminSession, mobileSession } from './helpers';

// E13-3 R55-1 … R55-5: S16 from Income and from the payout message; lines, problem, refund and payout.
test('order income detail: frozen with a problem, then each line, the refund and the payout', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, true);
  const cg = r.caregiver;
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/problem`, { headers: cg.headers, data: { kind: 'cannot_serve', description: 'I am unwell this week' } })).ok()).toBe(true);

  await mobileSession(page, cg.token, '/pages/caregiver/income');
  await page.locator(`[data-test=income-${order.number}]`).click();
  await expect(page).toHaveURL(/pages\/caregiver\/settlement\?id=/);
  await expect(page.locator('[data-test=settle-status]')).toHaveText('Frozen: a problem is open');
  await expect(page.locator('[data-test=settle-amount]')).toHaveText('RM68');
  await expect(page.locator('[data-test=line-0] [data-test=line-problem]')).toHaveText(' (problem open)');
  await expect(page.locator('[data-test=line-math]')).toHaveText(['RM40 × 85% = RM34', 'RM40 × 85% = RM34']);
  await expect(page.locator('[data-test=problem]')).toContainText("Visit 1 · You reported: Can't do the service");
  await expect(page.locator('[data-test=problem-status]')).toHaveText('Sent');
  await expect(page.locator('[data-test=payout-none]')).toHaveText('Paid as one payout once the order is settled.');

  // The admin decides (caregiver at fault), the refund lands, the order settles.
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.close();
  expect((await request.post(`${API}/admin/exceptions/${order.id}/0/decide`, { headers: header, data: { fault: 'caregiver', refundPercent: 100, reason: 'Could not come' } })).ok()).toBe(true);
  const pay = async (ref: string) => {
    const p = ((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).find((x) => x.ref === ref)!;
    expect((await request.post(`${API}/mock-gateway/payments/${p.id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  };
  await pay(`order-${order.id}-refund-x0`);
  expect((await request.post(`${API}/dev/order-finish`, { data: { number: order.number } })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/order-settled`, { data: { number: order.number } })).ok()).toBe(true);

  // R55-1: from the payout message.
  await mobileSession(page, cg.token, '/pages/messages/index');
  await page.locator('[data-test=message]', { hasText: 'Payout on its way: RM34' }).click();
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(/pages\/caregiver\/settlement\?id=/);
  await expect(page.locator('[data-test=settle-status]')).toHaveText('Paying');
  await expect(page.locator('[data-test=settle-amount]')).toHaveText('RM34');
  await expect(page.locator('[data-test=line-label]')).toHaveText(['Visit 1 closed · nothing to pay', 'Visit 2 service']);
  await expect(page.locator('[data-test=line-math]')).toHaveText(['no income', 'RM40 × 85% = RM34']);
  await expect(page.locator('[data-test=line-problem]')).toHaveCount(0);
  await expect(page.locator('[data-test=problem-status]')).toHaveText('Decided');
  await expect(page.locator('[data-test=refund]')).toContainText('Visit 1: problem decision');
  await expect(page.locator('[data-test=refund-state]')).toHaveText('Refunded to the owner');
  await expect(page.locator('[data-test=payout-state]')).toHaveText(/^Paying · \d{1,2}:\d\d [ap]m, /);
  await expect(page.locator('[data-test=payout-amount]')).toHaveText('RM34');

  await pay(`order-${order.id}-payout`);
  await page.reload();
  await expect(page.locator('[data-test=settle-status]')).toHaveText(/^Paid \w{3} \d{1,2} \w{3}$/);
  await expect(page.locator('[data-test=payout-state]')).toHaveText(/^Paid · /);
  // The problem row opens the visit's problem page.
  await page.locator('[data-test=problem]').click();
  await expect(page).toHaveURL(/pages\/caregiver\/problem\?id=\d+&i=0/);
});
