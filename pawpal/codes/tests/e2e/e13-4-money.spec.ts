import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

// E13-4 R56-1 … R56-5: a failed payout is on Money; the admin sends it again once; only the bank's answer makes it paid.
test('a failed payout is sent again from Money and paid once', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  expect((await request.post(`${API}/dev/order-finish`, { data: { number: order.number } })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/order-settled`, { data: { number: order.number } })).ok()).toBe(true);
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request, ['money', 'payments']);
  await admin.setViewportSize({ width: 1280, height: 900 });
  const base = `order-${order.id}-payout`;
  const tries = async () => (((await (await request.get(`${API}/payments`, { headers: header })).json()) as { id: number; ref: string }[]).filter((p) => p.ref.startsWith(base)).sort((a, b) => a.id - b.id));
  const first = (await tries())[0];
  expect((await request.post(`${API}/mock-gateway/payments/${first.id}/outcome`, { data: { outcome: 'failure' } })).ok()).toBe(true);

  // A13: failed first, with the bank's reason.
  await admin.goto(`${ADMIN}/money`);
  await expect(admin.locator('[data-test=money-note]')).toContainText('Nothing can be marked paid by hand.');
  await admin.locator('[data-test=money-tab-failed]').click();
  const row = admin.locator('[data-test=money] .el-table__row', { hasText: order.number });
  await expect(row).toContainText('Order payout');
  await expect(row).toContainText('RM34');
  await expect(row).toContainText('Declined by bank (mock)');
  await expect(admin.locator(`[data-test="money-state-${base}"]`)).toHaveText('Failed');

  // A14: the try and its reason; Send again makes one new try.
  await admin.locator(`[data-test="money-open-${base}"]`).click();
  await expect(admin).toHaveURL(new RegExp(`/money/${base}$`));
  await expect(admin.locator('[data-test=money-how]')).toHaveText(`Automatic payout to caregiver-${r.caregiverId}`);
  await expect(admin.locator('[data-test=money-try]')).toHaveText(['Failed: Declined by bank (mock)']);
  await expect(admin.locator('[data-test=check-bank]')).toHaveCount(0);
  await expect(admin.locator('.actions')).not.toContainText(/mark|paid/i);
  await admin.locator('[data-test=send-again]').click();
  await expect(admin.locator('.el-message-box')).toContainText('Send RM34 again? This makes one new try.');
  await admin.locator('.el-message-box .el-button--primary').click();
  await expect(admin.locator('[data-test=money-status]')).toHaveText('Processing');
  await expect(admin.locator('[data-test=money-try]')).toHaveText(['Failed: Declined by bank (mock)', 'Processing']);
  await expect(admin.locator('[data-test=send-again]')).toHaveCount(0);
  await expect(admin.locator('[data-test=money-log-line]').filter({ hasText: /^Admin \(/ })).toHaveText([new RegExp(`^Admin \\(.+\\): Sent again by admin \\(try 2, ${base}-r1\\)$`)]);

  // R56-3: pressing again through the API does not pay twice.
  expect((await request.post(`${API}/admin/money/${base}/send-again`, { headers: header })).status()).toBe(409);
  const all = await tries();
  expect(all.map((t) => t.ref)).toEqual([base, `${base}-r1`]);

  // R56-5: the bank confirms the new try; the caregiver is told and S16 shows Paid.
  expect((await request.post(`${API}/mock-gateway/payments/${all[1].id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  await admin.reload();
  await expect(admin.locator('[data-test=money-status]')).toHaveText('Done');
  await expect(admin.locator('[data-test=money-hint]')).toHaveText('The bank confirmed it. Nothing more to do.');
  await admin.close();
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/settlement?id=${order.id}`);
  await expect(page.locator('[data-test=settle-status]')).toHaveText(/^Paid /);
  await mobileSession(page, r.caregiver.token, '/pages/messages/index');
  await expect(page.locator('body')).toContainText('Paid: RM34');
});
