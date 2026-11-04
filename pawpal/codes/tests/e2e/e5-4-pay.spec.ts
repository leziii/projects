import { expect, test } from '@playwright/test';
import { readyToPay as owner } from './booking-helpers';
import { API, mobileSession } from './helpers';

// E5-4: the owner checks everything on O10, ticks the health declaration and pays on the test payment page.
test('a missing step shows on O10 with a link to fix it, and Pay stays off', async ({ page, browser, request }) => {
  const { token } = await owner(request, browser, false);
  await mobileSession(page, token, '/pages/booking/confirm');
  await expect(page.locator('[data-test=problem]')).toHaveCount(1);
  await expect(page.locator('[data-test=problem]')).toContainText('Say how the caregiver gets in');
  await page.locator('[data-test=health]').click();
  await expect(page.locator('[data-test=pay]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=pay-hint]')).toHaveText('Fix the points above to pay.');

  await page.locator('[data-test=fix-entry]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/entry/);
  await page.locator('[data-test=method-live_confirm]').click();
  await page.locator('[data-test=save-entry]').click();
  await expect(page.locator('[data-test=entry-hint]')).toHaveText('Saved. Next: check everything and pay.');
  await page.locator('[data-test=to-confirm]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/confirm/);
  await expect(page.locator('[data-test=problem]')).toHaveCount(0);
});

test('owner confirms, a failed payment is tried again, then it is paid and waits for the caregiver', async ({ page, browser, request }) => {
  const { token } = await owner(request, browser, true);
  await mobileSession(page, token, '/pages/booking/index');
  await expect(page.locator('[data-test=next-hint]')).toHaveText('All set. Next: check everything and pay.');
  await expect(page.locator('[data-test=next]')).toHaveText('Next: confirm and pay');
  await page.locator('[data-test=next]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/confirm/);

  await expect(page.locator('[data-test=caregiver]')).toHaveText(/^Lim M\.$/);
  await expect(page.locator('[data-test=pets]')).toHaveText('For Mimi');
  await expect(page.locator('[data-test=line]')).toHaveCount(1);
  await expect(page.locator('[data-test=total]')).toHaveText('RM40');
  await expect(page.locator('[data-test=entry-method]')).toHaveText('Live confirm');
  await expect(page.locator('[data-test=cancel-policy]')).toHaveText(['• 24 h or more before a visit: 100% back', '• 1 h to under 24 h: 80% back', '• Under 1 h: no refund']);
  await expect(page.locator('[data-test=not-accepted]')).toHaveText('Paid is not accepted. The caregiver must accept the whole order in time.');
  await expect(page.locator('[data-test=pay]')).toHaveAttribute('disabled', 'true');
  await expect(page.locator('[data-test=pay-hint]')).toHaveText('Tick the health declaration to pay.');

  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay-duitnow]').click();
  await page.locator('[data-test=pay]').click();
  await expect(page).toHaveURL(/\/pages\/pay\/test/);
  await expect(page.locator('[data-test=amount]')).toHaveText('RM40');
  await expect(page.locator('[data-test=method]')).toHaveText('DuitNow');
  await page.locator('[data-test=outcome-failure]').click();

  await expect(page).toHaveURL(/\/pages\/orders\/result/);
  await expect(page.locator('[data-test=result-title]')).toHaveText('Payment failed');
  await expect(page.locator('[data-test=result-title]')).toHaveClass(/bad/); // shown in red
  const number = (await page.locator('[data-test=order-number]').textContent())!.match(/P\d{11,}/)![0];
  await page.locator('[data-test=retry]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/confirm/);
  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await expect(page).toHaveURL(/\/pages\/pay\/test/);
  await expect(page.locator('[data-test=method]')).toHaveText("Touch 'n Go");
  await page.locator('[data-test=outcome-success]').click();

  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');
  await expect(page.locator('[data-test=result-title]')).toHaveClass(/ok/);
  await expect(page.locator('[data-test=result-body]')).toContainText(/Lim M\. has (2 h 5\d|3 h 0) min left to accept \(until /);
  await expect(page.locator('[data-test=order-number]')).toContainText(number); // same order as the failed try
  await expect(page.locator('[data-test=retry]')).toHaveCount(0);

  // Paid: the booking draft is cleared for a new booking.
  const draft = await (await request.get(`${API}/bookings/draft`, { headers: { authorization: `Bearer ${token}` } })).json();
  expect(draft.caregiver).toBeNull();
  expect(draft.visits).toEqual([]);
});

test('still checking: the result is found by asking the bank', async ({ page, browser, request }) => {
  const { token } = await owner(request, browser, true);
  await mobileSession(page, token, '/pages/booking/confirm');
  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await page.locator('[data-test=outcome-unknown]').click();
  await expect(page).toHaveURL(/\/pages\/orders\/result/);
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');
});
