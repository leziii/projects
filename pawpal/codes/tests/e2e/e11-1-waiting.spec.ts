import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { API, MOBILE, mobileSession } from './helpers';

// E11-1 R45-1 … R45-6: after arriving, "Owner asked me to wait" tells the owner and opens S14 with the clock and fee.
test('caregiver asks to wait: S14 shows the clock, the fee, then the limit', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  const soon = (await (await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).json()) as { date: string; start: number };
  const startAt = Date.parse(`${soon.date}T00:00:00+08:00`) + soon.start * 60_000;

  await mobileSession(page, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=ask-wait]')).toHaveCount(0);
  await page.locator('[data-test=arrive]').click();
  await expect(page.locator('[data-test=arrived-at]')).toBeVisible();
  await page.locator('[data-test=ask-wait]').click();
  await expect(page.locator('.uni-modal')).toContainText('First 10 min free, then RM5 per started 10 min, up to 60 min / RM25.');
  await page.locator('.uni-modal__btn_primary').click();

  // Arrived before the booked start: the clock has not begun.
  await expect(page.locator('[data-test=waiting-text]')).toHaveText(/^Waiting starts at \d{1,2}:\d\d [ap]m, the booked start$/);
  await expect(page.locator('[data-test=waiting-fee]')).toHaveText('RM0');
  await expect(page.locator('[data-test=waiting-sent]')).toContainText('prepay RM25');
  const { items } = (await (await request.get(`${API}/messages`, { headers: r.headers })).json()) as { items: { title: string }[] };
  expect(items.map((m) => m.title).some((t) => t.endsWith('is waiting for you'))).toBe(true);

  // 14 min after the booked start: RM5 so far.
  await page.clock.install({ time: new Date(startAt + 14 * 60_000 + 5_000) });
  await page.reload();
  await expect(page.locator('[data-test=waiting-text]')).toHaveText('Waiting 14 min · RM5 so far');
  await expect(page.locator('[data-test=waiting-minutes]')).toHaveText('14 min');
  await expect(page.locator('[data-test=waiting-limit]')).toHaveCount(0);

  // Over an hour: capped, the limit card with help.
  await page.clock.setSystemTime(new Date(startAt + 75 * 60_000));
  await page.reload();
  await expect(page.locator('[data-test=waiting-text]')).toHaveText('Waiting limit reached · 60 min · RM25');
  await expect(page.locator('[data-test=waiting-fee]')).toHaveText('RM25');
  await expect(page.locator('[data-test=waiting-limit]')).toContainText('Waiting limit reached.');
  await expect(page.locator('[data-test=help-button]')).toBeVisible();

  // Back on S10 the line shows, and the button is gone.
  await page.goto(`${MOBILE}/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=waiting-line]')).toHaveText('Waiting limit reached · 60 min · RM25');
  await expect(page.locator('[data-test=ask-wait]')).toHaveCount(0);

  // The owner lets them in: the clock stops.
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  await page.goto(`${MOBILE}/pages/caregiver/waiting?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=waiting-text]')).toHaveText(/^Waited \d+ min · /);
  await expect(page.locator('[data-test=continue-service]')).toBeVisible();
});
