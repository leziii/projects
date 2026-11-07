import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const CLOCK = '\\d{1,2}:\\d\\d (am|pm)';
const DAY = '\\w{3} \\d{1,2} \\w{3}';

// E9-1 O17: the owner opens the sent report from the message, the visit page and the order; read only until E9-2.
test('owner reads the report: photos, checklist, note, sent time and deadline', async ({ page, browser, request }) => {
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
  for (const item of ['feed', 'water']) expect((await request.post(`${base}/check`, { headers: r.caregiver.headers, data: { item, done: true } })).ok()).toBe(true);
  expect((await request.post(`${base}/note`, { headers: r.caregiver.headers, data: { note: 'No litter box, owner uses pads' } })).ok()).toBe(true);

  // R39-3: nothing to read before it is sent.
  await mobileSession(page, r.token, `/pages/orders/report?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=error]')).toHaveText('The caregiver has not sent the report yet');
  expect((await request.post(`${base}/report`, { headers: r.caregiver.headers })).ok()).toBe(true);

  // R39-1: the message opens the report.
  const { items } = await (await request.get(`${API}/messages`, { headers: r.headers })).json();
  const msg = items.find((m: { title: string }) => m.title === 'Report for visit 1 is ready');
  expect(msg.link.type).toBe('report');
  await page.goto(`${MOBILE}/pages/messages/view?id=${msg.id}`);
  await expect(page.locator('[data-test=latest-summary]')).toHaveText(`Order ${order.number}: report for visit 1`);
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/report\\?run=${msg.link.id}`));

  // R39-2: what O17 shows.
  await expect(page.locator('[data-test=report-visit]')).toHaveText('Visit 1');
  await expect(page.locator('[data-test=report-caregiver]')).toHaveText(new RegExp(`^By \\S+ \\S\\. · ${order.number}$`));
  await expect(page.locator('[data-test=report-photo]')).toHaveCount(3);
  await expect(page.locator('[data-test=report-photo] img').first()).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('[data-test=report-check]')).toHaveText(['Feed✓ Done', 'Fresh water✓ Done', 'Litter✗ Not done']);
  await expect(page.locator('[data-test=report-note]')).toHaveText('No litter box, owner uses pads');
  await expect(page.locator('[data-test=report-sent]')).toHaveText(new RegExp(`^Sent ${CLOCK}, ${DAY}$`));
  await expect(page.locator('[data-test=report-deadline]')).toHaveText(new RegExp(`^Please check by ${CLOCK}, ${DAY}$`));
  await expect(page.locator('[data-test=confirm-report]')).toBeVisible();

  // R39-1: from the order (O13) and the visit (O14).
  await page.goto(`${MOBILE}/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Report ready');
  await expect(page.locator('[data-test=report-ready]')).toHaveText(new RegExp(`^Report ready · check by ${CLOCK}(, ${DAY})? ›$`));
  await page.locator('[data-test=report-ready]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/report\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=report-photo]')).toHaveCount(3);

  await page.goto(`${MOBILE}/pages/orders/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=view-report]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/report\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=report-note]')).toHaveText('No litter box, owner uses pads');

  // R39-4: the caregiver's own photo address is not open to the owner, and other owners cannot read it.
  const photo = (await (await request.get(base, { headers: r.caregiver.headers })).json()).photos[0];
  expect((await request.get(`${API}/orders/${order.id}/visits/0/photos/${photo}`, { headers: r.headers })).status()).toBe(200);
  expect((await request.get(`${API}/orders/${order.id}/visits/0/photos/${photo}`, { headers: r.caregiver.headers })).status()).toBe(404);
});
