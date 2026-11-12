import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// A real 2 × 2 PNG, so the phone can shrink it before upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

// E8-4 S11: after entry the caregiver records the service: served time, checklist, photos; finishing early asks first.
test('service page: timer, checklist saved per tick, photos added and deleted, finish early asks', async ({ page, browser, request }) => {
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

  // R36-1: the visit page leads back to the service.
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=continue-service]').click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/service\\?id=${order.id}&i=0`));

  // R36-2: served time against the minimum.
  await expect(page.locator('[data-test=service-status]')).toHaveText('In service');
  await expect(page.locator('[data-test=served]')).toHaveText(/^Served 0 min \/ at least \d+ min$/);

  // R36-3: one cat, so Feed, Fresh water and Litter; a tick is saved at once.
  await expect(page.locator('[data-test^=check-]')).toHaveCount(3);
  await expect(page.locator('[data-test=check-walk]')).toHaveCount(0);
  await page.locator('[data-test=check-litter]').click();
  await expect(page.locator('[data-test=check-litter]')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.locator('[data-test=check-litter]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-test=check-feed]')).toHaveAttribute('aria-checked', 'false');

  // R36-4: photos are saved straight away and can be deleted.
  await expect(page.locator('[data-test=photo-count]')).toHaveText('0 of 9 photos');
  // KF hand test (E9-2): several photos chosen at once.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=photo-add]').click()]);
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([1, 2].map((n) => ({ name: `p${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await expect(page.locator('[data-test=photo-count]')).toHaveText('2 of 9 photos');
  await expect(page.locator('[data-test=photo] img')).toHaveCount(2);
  await page.locator('[data-test=photo-delete]').first().click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=photo-count]')).toHaveText('1 of 9 photos');

  // KF hand test: a failed upload stays in the row with ↻ here too, and holds Finish until it is sorted.
  await page.route('**/caregiver/tasks/*/0/photos', (route) => route.abort());
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=photo-add]').click()]);
  await again.setFiles({ name: 'p3.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-test=pending-failed]')).toBeVisible();
  await expect(page.locator('[data-test=finish]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=finish-wait]')).toHaveText('A photo failed to upload. Tap ↻ to try again, or remove it');
  await page.unroute('**/caregiver/tasks/*/0/photos');
  await page.locator('[data-test=retry]').click();
  await expect(page.locator('[data-test=photo-count]')).toHaveText('2 of 9 photos');
  await expect(page.locator('[data-test=finish-wait]')).toHaveCount(0);

  // R36-6: Report a problem is still greyed; overtime works since E11-2 (R46-1).
  await expect(page.locator('[data-test=overtime]')).not.toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=problem]')).toHaveAttribute('disabled', 'true');

  // R36-5: under the minimum, finishing asks first; Cancel stays, OK opens the report placeholder.
  await page.locator('[data-test=finish]').click();
  await expect(page.locator('.uni-modal')).toContainText(/You have served 0 of \d+ min\. Finish anyway\?/);
  await page.locator('.uni-modal__btn_default').click();
  await expect(page).toHaveURL(/pages\/caregiver\/service/);
  await page.locator('[data-test=finish]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/report\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=send]')).toHaveAttribute('disabled', 'true');
});
