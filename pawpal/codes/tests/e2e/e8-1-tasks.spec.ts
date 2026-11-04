import { expect, test } from '@playwright/test';
import { day, readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E8-1: the caregiver sees accepted visits day by day, with the gap between them.
test('My tasks lists accepted visits by day with the gap; a task opens its request', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const payAndAccept = async () => {
    const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
    expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
    expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
    return order as { id: number; number: string };
  };
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const first = await payAndAccept(); // 10:00 am
  // A second booking the same afternoon.
  expect((await request.post(`${API}/bookings/draft`, { headers: r.headers, data: { petIds: [r.cat.id], visits: [{ date: day, start: 840 }] } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/caregiver`, { headers: r.headers, data: { caregiverId: r.caregiverId } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/entry`, { headers: r.headers, data: { method: 'live_confirm' } })).ok()).toBe(true);
  const second = await payAndAccept(); // 2:00 pm

  await mobileSession(page, r.caregiver.token, '/pages/caregiver/index');
  await expect(page.locator('[data-test=today-count]')).toHaveText('No visits today.');
  await page.locator('[data-test=tasks-card]').click();
  await expect(page.locator('[data-test=no-tasks]')).toHaveText('No tasks on this day.');

  await expect(page.locator(`[data-test=day-${day}] [data-test=day-count]`)).toHaveText('2');
  await page.locator(`[data-test=day-${day}]`).click();
  const tasks = page.locator('[data-test=task]');
  await expect(tasks).toHaveCount(2);
  await expect(tasks.nth(0).locator('[data-test=task-time]')).toHaveText(/^10:00 – 10:\d\d am$/);
  await expect(tasks.nth(0).locator('[data-test=task-status]')).toHaveText('To do');
  await expect(tasks.nth(0).locator('[data-test=task-area]')).toHaveText('Bangsar');
  await expect(tasks.nth(0).locator('[data-test=task-pets]')).toHaveText('Mimi · 1 cat');
  await expect(tasks.nth(0).locator('[data-test=task-length]')).toHaveText(new RegExp(` min · ${first.number}$`));
  await expect(tasks.nth(1).locator('[data-test=task-length]')).toHaveText(new RegExp(` min · ${second.number}$`));
  await expect(page.locator('[data-test=gap]')).toHaveText(/^3 h \d+ min gap$/);

  // R34-1: a task opens the visit page (S09).
  await tasks.nth(0).click();
  await expect(page).toHaveURL(new RegExp(`pages/caregiver/visit\\?id=${first.id}&i=0`));
  await expect(page.locator('[data-test=visit-number]')).toHaveText(first.number);
});
