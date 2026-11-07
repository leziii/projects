import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { day, readyToPay } from './booking-helpers';
import { ADMIN, API, MOBILE, adminSession, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

/** A paid, accepted one-visit order whose report the owner has confirmed. */
async function confirmedOrder(request: APIRequestContext, browser: Browser) {
  const r = await readyToPay(request, browser, false);
  expect((await request.post(`${API}/bookings/draft/entry`, { headers: r.headers, data: { method: 'pre_authorised', keyLock: 'Code 4821#', guard: '', notes: '' } })).ok()).toBe(true);
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  const base = `${API}/caregiver/tasks/${order.id}/0`;
  expect((await request.post(`${base}/arrive`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${base}/enter`, { headers: r.caregiver.headers })).ok()).toBe(true);
  for (const n of [1, 2, 3]) {
    expect((await request.post(`${base}/photos`, { headers: r.caregiver.headers, multipart: { photo: { name: `p${n}.png`, mimeType: 'image/png', buffer: PNG } } })).ok()).toBe(true);
  }
  for (const item of ['feed', 'water', 'litter']) expect((await request.post(`${base}/check`, { headers: r.caregiver.headers, data: { item, done: true } })).ok()).toBe(true);
  expect((await request.post(`${base}/report`, { headers: r.caregiver.headers })).ok()).toBe(true);
  const name = (await (await request.get(`${API}/orders/${order.id}/detail`, { headers: r.headers })).json()).caregiver.displayName as string;
  return { r, order, name };
}
const confirm = async (request: APIRequestContext, headers: Record<string, string>, id: number) =>
  expect((await request.post(`${API}/orders/${id}/visits/0/confirm`, { headers })).ok()).toBe(true);

// E9-3 R41-1 … R41-5: rate once all visits are confirmed; the caregiver replies; profile and list show it.
test('owner rates the caregiver; caregiver replies; profile and list show the rating', async ({ page, browser, request }) => {
  const { r, order, name } = await confirmedOrder(request, browser);
  // Not before the visit is confirmed.
  await mobileSession(page, r.token, `/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=report-ready]')).toBeVisible();
  await expect(page.locator('[data-test=rate-box]')).toHaveCount(0);
  await confirm(request, r.headers, order.id);
  await page.reload();
  await expect(page.locator('[data-test=rate-until]')).toHaveText(/^You can rate until \w{3} \d{1,2} \w{3}$/);
  await page.locator('[data-test=rate]').click();

  await expect(page).toHaveURL(new RegExp(`pages/orders/review\\?id=${order.id}`));
  await expect(page.locator('[data-test=review-for]')).toHaveText(`Rate ${name}`);
  await expect(page.locator('[data-test=send-review]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=stars-label]')).toHaveText('Tap a star');
  await page.locator('[data-test=star-4]').click();
  await expect(page.locator('[data-test=stars-label]')).toHaveText('Very good');
  await expect(page.locator('[data-test=stars] .on')).toHaveCount(4);
  await page.locator('[data-test=comment] textarea').fill('Kind and on time');
  await expect(page.locator('[data-test=comment-count]')).toHaveText('16 / 300');
  await page.locator('[data-test=send-review]').click();

  await expect(page).toHaveURL(new RegExp(`pages/orders/detail\\?id=${order.id}`));
  await expect(page.locator('[data-test=rate-box]')).toHaveCount(0);
  await expect(page.locator('[data-test=my-review] [data-test=review-stars]')).toHaveText('★★★★☆');
  await expect(page.locator('[data-test=my-review] [data-test=review-who]')).toHaveText(/^Ali · \w{3} \d{4}$/);
  await expect(page.locator('[data-test=my-review] [data-test=review-comment]')).toHaveText('Kind and on time');

  // S07: the caregiver replies once.
  const cg = await browser.newPage();
  await mobileSession(cg, r.caregiver.token, `/pages/caregiver/request?id=${order.id}`);
  await expect(cg.locator('[data-test=request-review] [data-test=review-comment]')).toHaveText('Kind and on time');
  await expect(cg.locator('[data-test=send-reply]')).toHaveAttribute('disabled', 'true');
  await cg.locator('[data-test=reply] textarea').fill('Thank you, Mimi was lovely!');
  await cg.locator('[data-test=send-reply]').click();
  await expect(cg.locator('[data-test=review-reply]')).toContainText('Thank you, Mimi was lovely!');
  await expect(cg.locator('[data-test=reply]')).toHaveCount(0);
  await cg.close();

  await page.reload();
  await expect(page.locator('[data-test=my-review] [data-test=review-reply]')).toContainText('Thank you, Mimi was lovely!');

  // O08 and O07.
  await page.goto(`${MOBILE}/pages/caregivers/detail?id=${r.caregiverId}`);
  await expect(page.locator('[data-test=card-rating]')).toHaveText('★ 4.0 (1 review)');
  await expect(page.locator('[data-test=reviews] [data-test=review]')).toHaveCount(1);
  await expect(page.locator('[data-test=reviews] [data-test=review-comment]')).toHaveText('Kind and on time');
  expect((await request.post(`${API}/bookings/draft`, { headers: r.headers, data: { petIds: [r.cat.id], visits: [{ date: day, start: 900 }] } })).ok()).toBe(true);
  await page.goto(`${MOBILE}/pages/booking/caregivers`);
  await expect(page.locator(`[data-test=option-${r.caregiverId}] [data-test=rating]`)).toHaveText('★ 4.0 (1)');
});

// R41-6: admin hides a review with a reason; it leaves the profile and the average.
test('admin hides a review with a reason', async ({ page, browser, request }) => {
  const { r, order } = await confirmedOrder(request, browser);
  await confirm(request, r.headers, order.id);
  expect((await request.post(`${API}/orders/${order.id}/review`, { headers: r.headers, data: { stars: 2, comment: 'Not nice words' } })).ok()).toBe(true);

  const admin = await browser.newPage();
  await adminSession(admin, request, ['reviews']);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/reviews`);
  const row = admin.locator('[data-test=reviews] .el-table__row', { hasText: order.number });
  await expect(row).toContainText('★★☆☆☆');
  await expect(row).toContainText('Not nice words');
  await row.locator('button', { hasText: 'Hide' }).click();
  await admin.locator('.el-message-box input').fill('Rude words');
  await admin.locator('.el-message-box button', { hasText: 'Hide' }).click();
  await expect(admin.locator('.el-message')).toContainText('Review hidden');
  await expect(row.locator('.el-tag')).toHaveText('Hidden');
  await expect(row).toContainText('Rude words');
  await admin.close();

  await mobileSession(page, r.token, `/pages/caregivers/detail?id=${r.caregiverId}`);
  await expect(page.locator('[data-test=card-rating]')).toHaveText('New');
  await expect(page.locator('[data-test=no-reviews]')).toHaveText('No reviews yet.');
});
