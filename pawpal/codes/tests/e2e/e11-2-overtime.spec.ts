import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E11-2 R46-1 … R46-5: in service, S11 → S14 Overtime; a time that runs into the next visit cannot be picked; send, then withdraw.
test('caregiver asks for overtime that fits the schedule, then withdraws it', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  const soon = (await (await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).json()) as { date: string; start: number };
  const cg = r.caregiver;
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/arrive`, { headers: cg.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  // Her next visit starts 45 min after this one ends: with the 30 min buffer only 15 min fits.
  const end = soon.start + order.visits[0].quote.totalMinutes;
  expect((await request.post(`${API}/dev/test-visit`, { data: { phone: cg.phone.e164, date: soon.date, start: end + 45, minutes: 30 } })).ok()).toBe(true);

  await mobileSession(page, cg.token, `/pages/caregiver/service?id=${order.id}&i=0`);
  await page.locator('[data-test=overtime]').click();
  await expect(page.locator('[data-test=fit-1]')).toHaveText(/^✓ Fits \(next visit \d{1,2}:\d\d [ap]m\)$/);
  await expect(page.locator('[data-test=fit-2]')).toHaveText(/^✗ Clashes with your \d{1,2}:\d\d [ap]m visit$/);
  await expect(page.locator('[data-test=send-overtime]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=units-2]').click();
  await expect(page.locator('[data-test=send-overtime]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=units-1]').click();
  await page.locator('[data-test=send-overtime]').click();
  await expect(page.locator('.uni-modal')).toContainText('15 min · RM10');
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=open-text]')).toHaveText('Asked: 15 min · RM10');

  const { items } = (await (await request.get(`${API}/messages`, { headers: r.headers })).json()) as { items: { title: string }[] };
  expect(items.map((m) => m.title)).toContain('Overtime asked: 15 min · RM10');

  // Back on S11 the request shows.
  await page.locator('[data-test=back-to-service]').click();
  await expect(page.locator('[data-test=overtime-open]')).toContainText('Overtime asked: 15 min · RM10');

  // Withdraw before the owner pays.
  await page.locator('[data-test=overtime]').click();
  await page.locator('[data-test=withdraw]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=open-request]')).toHaveCount(0);
  await expect(page.locator('[data-test=units-1]')).toBeVisible();
});
