import { expect, test } from '@playwright/test';
import { day, readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E8-2: the caregiver's visit page shows what is needed; entry instructions stay locked until 2 h before.
test('visit page shows time, service, income, pets and address; entry instructions are locked until 2 h before', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);

  await mobileSession(page, r.caregiver.token, '/pages/caregiver/tasks');
  await page.locator(`[data-test=day-${day}]`).click();
  await page.locator('[data-test=task]').click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/visit\\?id=${order.id}&i=0`));

  await expect(page.locator('[data-test=visit-when]')).toHaveText(/ · 10:00 – 10:\d\d am$/);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('To do');
  await expect(page.locator('[data-test=visit-service]')).toHaveText(/^Basic care · at least \d+ min$/);
  await expect(page.locator('[data-test=visit-number]')).toHaveText(order.number);
  await expect(page.locator('[data-test=visit-income]')).toHaveText(/^You earn RM\d+/);
  await expect(page.locator('[data-test=pet-name]')).toHaveText('Mimi · Cat');
  await expect(page.locator('[data-test=pet-facts]')).toHaveText('3 yrs');
  await expect(page.locator('[data-test=entry-method]')).toHaveText('Live confirm');
  await expect(page.locator('[data-test=entry-key]')).toHaveCount(0);
  await expect(page.locator('[data-test=entry-later]')).toHaveText(/^🔒 Shown from 8:00 am, /);
  await expect(page.locator('[data-test=visit-address]')).toHaveText('A-3-1, 12 Jalan Telawi, 59100 Bangsar');
  await expect(page.locator('[data-test=visit-contact]')).toHaveText('Ali · +60123456789');
  await expect(page.locator('[data-test=call]')).toBeVisible();
  // R35-2: "I've arrived" opens 30 min before the start.
  await expect(page.locator('[data-test=arrive]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=arrive-note]')).toHaveText('From 9:30 am');
});
