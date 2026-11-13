import { expect, test, type APIRequestContext } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

type Booked = Awaited<ReturnType<typeof booked>>;

const succeed = async (request: APIRequestContext, id: number) => expect((await request.post(`${API}/mock-gateway/payments/${id}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);

/** The owner pays fee `kind` of visit 1 through the API. */
async function payFee(request: APIRequestContext, b: Booked, kind: 'waiting' | 'overtime') {
  const fees = (await (await request.get(`${API}/orders/${b.order.id}/extra-fees`, { headers: b.r.headers })).json()) as { id: number; kind: string }[];
  const fee = fees.find((f) => f.kind === kind)!;
  const { paymentId } = (await (await request.post(`${API}/orders/${b.order.id}/extra-fees/${fee.id}/pay`, { headers: b.r.headers, data: { method: 'tng' } })).json()) as { paymentId: number };
  await succeed(request, paymentId);
  return fee.id;
}

// E11-4 R48-1, R48-3: prepaid RM25, let in after 25 min → RM10 used, RM15 back; O19 and O16 show it.
test('unused waiting prepay is refunded when the owner lets the caregiver in', async ({ page, browser, request }) => {
  const b = await booked(request, browser, false);
  const { r, order } = b;
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/arrive`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/wait`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);
  const feeId = await payFee(request, b, 'waiting');
  // Booked start was 10 min ahead: the admin test tool passes 35 min, so it was 25 min ago.
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=shift-number]').fill(order.number.toLowerCase());
  await admin.locator('[data-test=shift-minutes] input').fill('35');
  await admin.locator('[data-test=shift-run]').click();
  await expect(admin.locator('.el-message--success')).toContainText(`35 min passed for visit 1 of ${order.number}`);
  await admin.close();

  await mobileSession(page, r.token, `/pages/orders/extra?id=${order.id}&fee=${feeId}`);
  await expect(page.locator('[data-test=fee-status]')).toHaveText('Paid');
  await expect(page.locator('[data-test=fee-used]')).toHaveCount(0);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=fee-used]')).toHaveText('Used 25 min · RM10 · RM15 on its way back');
  await page.locator('[data-test=see-refunds]').click();
  await expect(page).toHaveURL(/\/pages\/orders\/refunds/);
  await expect(page.locator('body')).toContainText('Waiting: unused prepay');
  await expect(page.locator('body')).toContainText('RM15');

  // The caregiver sees what was earned.
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=waited-line]')).toHaveText('Waited 25 min · RM10');
});

// R48-2, R48-4: paid 30 min of overtime, report sent 10 min after the end → RM10 used, RM10 back.
test('unused overtime is refunded when the report is sent', async ({ page, browser, request }) => {
  const b = await booked(request, browser, false);
  const { r, order } = b;
  const cg = r.caregiver;
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/arrive`, { headers: cg.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/overtime`, { headers: cg.headers, data: { units: 2 } })).ok()).toBe(true);
  const feeId = await payFee(request, b, 'overtime');
  // Start was 10 min ahead: move by the service length + 20 so the booked end was 10 min ago.
  const minutes = order.visits[0].quote.totalMinutes;
  expect((await request.post(`${API}/dev/visit-shift`, { data: { number: order.number, index: 0, minutes: minutes + 20 } })).ok()).toBe(true);

  const base = `${API}/caregiver/tasks/${order.id}/0`;
  const jpeg = { name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]) };
  for (let n = 0; n < 3; n++) expect((await request.post(`${base}/photos`, { headers: cg.headers, multipart: { photo: jpeg } })).ok()).toBe(true);
  const v = (await (await request.get(base, { headers: cg.headers })).json()) as { checklist: { item: string }[] };
  for (const c of v.checklist) await request.post(`${base}/check`, { headers: cg.headers, data: { item: c.item, done: true } });

  expect((await request.post(`${base}/report`, { headers: cg.headers, data: {} })).ok()).toBe(true);
  await mobileSession(page, cg.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=overtime-earned]')).toHaveText('Overtime used 15 min · RM10');

  await mobileSession(page, r.token, `/pages/orders/extra?id=${order.id}&fee=${feeId}`);
  await expect(page.locator('[data-test=fee-used]')).toHaveText('Used 15 min · RM10 · RM10 on its way back');
  await page.locator('[data-test=see-refunds]').click();
  await expect(page.locator('body')).toContainText('Overtime: unused time');
});
