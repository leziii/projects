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
  for (const n of [1, 2]) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=photo-add]').click()]);
    await chooser.setFiles({ name: `p${n}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('[data-test=photo-count]')).toHaveText(`${n} of 9 photos`);
  }
  await expect(page.locator('[data-test=photo] img')).toHaveCount(2);
  await page.locator('[data-test=photo-delete]').first().click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=photo-count]')).toHaveText('1 of 9 photos');

  // R36-6: later buttons are greyed.
  await expect(page.locator('[data-test=overtime]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=problem]')).toHaveAttribute('disabled', 'true');

  // R36-5: under the minimum, finishing asks first; Cancel stays, OK opens the report placeholder.
  await page.locator('[data-test=finish]').click();
  await expect(page.locator('.uni-modal')).toContainText(/You have served 0 of \d+ min\. Finish anyway\?/);
  await page.locator('.uni-modal__btn_default').click();
  await expect(page).toHaveURL(/pages\/caregiver\/service/);
  await page.locator('[data-test=finish]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/report\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=report-later]')).toContainText('E8-5');
});
