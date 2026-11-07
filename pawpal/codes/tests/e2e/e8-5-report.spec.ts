import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const CLOCK = '\\d{1,2}:\\d\\d (am|pm)';

// E8-5 S12: a failed upload blocks sending; 3 photos and a note for unticked items are needed; sending locks it and starts 12 h.
test('report: failed upload blocks, problems listed, note saved, send locks and shows the deadline', async ({ page, browser, request }) => {
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
  for (const n of [1, 2]) {
    expect((await request.post(`${base}/photos`, { headers: r.caregiver.headers, multipart: { photo: { name: `p${n}.png`, mimeType: 'image/png', buffer: PNG } } })).ok()).toBe(true);
  }
  for (const item of ['feed', 'water']) expect((await request.post(`${base}/check`, { headers: r.caregiver.headers, data: { item, done: true } })).ok()).toBe(true);

  await mobileSession(page, r.caregiver.token, `/pages/caregiver/report?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=photo-count]')).toHaveText('2 of 9 photos');
  await expect(page.locator('[data-test=problem]')).toHaveText(['• Add at least 3 photos (2 so far)', '• Add a note on why Litter was not done']);
  await expect(page.locator('[data-test=send]')).toHaveAttribute('disabled', 'true');

  // R37-3: the upload fails: the photo stays to retry and still blocks sending.
  await page.route('**/caregiver/tasks/*/0/photos', (route) => route.abort());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=photo-add]').click()]);
  await chooser.setFiles({ name: 'p3.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-test=pending-failed]')).toBeVisible();
  // KF hand test: the failed photo sits in the row with the others, after the saved ones.
  const tile = (await page.locator('[data-test=pending-failed]').boundingBox())!;
  const last = (await page.locator('[data-test=photo]').last().boundingBox())!;
  expect(Math.abs(tile.y - last.y)).toBeLessThan(2);
  expect(tile.x).toBeGreaterThan(last.x);
  await expect(page.locator('[data-test=problem]')).toContainText(['• A photo failed to upload. Tap ↻ to try again, or remove it']);
  await page.unroute('**/caregiver/tasks/*/0/photos');
  await page.locator('[data-test=retry]').click();
  await expect(page.locator('[data-test=photo-count]')).toHaveText('3 of 9 photos');
  await expect(page.locator('[data-test=pending-failed]')).toHaveCount(0);
  await expect(page.locator('[data-test=problem]')).toHaveText(['• Add a note on why Litter was not done']);

  // R37-2: the note is saved as a draft.
  await page.locator('[data-test=note] textarea').fill('No litter box at home, owner uses pads');
  await expect(page.locator('[data-test=note-state]')).toHaveText('Draft saved');
  await page.reload();
  await expect(page.locator('[data-test=note] textarea')).toHaveValue('No litter box at home, owner uses pads');
  await expect(page.locator('[data-test=problems]')).toHaveCount(0);

  // R37-4, R37-6: send, back on the visit page with the deadline.
  await page.locator('[data-test=send]').click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/visit\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Report sent');
  await expect(page.locator('[data-test=sent-at]')).toHaveText(new RegExp(`^Sent ${CLOCK} · owner confirms by ${CLOCK}(, \\w{3} \\d{1,2} \\w{3})?$`));

  // R37-5: locked; the report page sends the caregiver back to the visit.
  await page.goto(`${MOBILE}/pages/caregiver/report?id=${order.id}&i=0`);
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/visit\\?id=${order.id}&i=0`));

  // R37-7: the owner sees it is sent.
  const owner = await browser.newPage();
  await mobileSession(owner, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(owner.locator('[data-test=visit-status]')).toHaveText('Report ready');
  await expect(owner.locator('[data-test=visit-report]')).toHaveText(new RegExp(`^Report ready · check by ${CLOCK}(, \\w{3} \\d{1,2} \\w{3})?$`));
  await owner.close();
});
