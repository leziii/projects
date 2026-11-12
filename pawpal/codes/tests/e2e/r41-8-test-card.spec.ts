import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { API, mobileSession } from './helpers';

// R41-8 (KF): paying by card on the TEST page asks for card details; they are checked here and never sent.
test('card payment asks for card details before the test bank answers', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'card' } })).json();
  const sent: string[] = [];
  page.on('request', (q) => q.postData() && sent.push(q.postData()!));
  await mobileSession(page, r.token, `/pages/pay/test?order=${order.id}&payment=${paymentId}`);
  await expect(page.locator('[data-test=method]')).toHaveText('Card');
  await expect(page.locator('[data-test=card-hint]')).toHaveText(['• Card number: 16 digits', '• Name on card', '• Expiry: MM/YY', '• CVV: 3 digits']);
  for (const o of ['success', 'failure', 'unknown']) await expect(page.locator(`[data-test=outcome-${o}]`)).toHaveAttribute('disabled', 'true');

  await page.locator('[data-test=card-number] input').fill('4111111111111112');
  await expect(page.locator('[data-test=card-number] input')).toHaveValue('4111 1111 1111 1112');
  await expect(page.locator('[data-test=card-hint]').first()).toHaveText('• Card number: check the digits');
  await page.locator('[data-test=card-number] input').fill('4111111111111111');
  await page.locator('[data-test=card-name] input').fill('Ali Tan');
  await page.locator('[data-test=card-expiry] input').fill('0120');
  await expect(page.locator('[data-test=card-expiry] input')).toHaveValue('01/20');
  await expect(page.locator('[data-test=card-hint]').first()).toHaveText('• Expiry: this card has expired');
  await page.locator('[data-test=card-expiry] input').fill('1230');
  await page.locator('[data-test=card-cvv] input').fill('123');
  await expect(page.locator('[data-test=card-missing]')).toHaveCount(0);
  await expect(page.locator('[data-test=card-note]')).toContainText('nothing is charged');
  await page.locator('[data-test=outcome-success]').click();

  await expect(page).toHaveURL(/\/pages\/orders\/result/);
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');
  // Nothing typed on the card form left the browser.
  expect(sent.filter((b) => /4111|Ali Tan|12\/30/.test(b))).toEqual([]);
});

test('other payment methods show no card form', async ({ page, browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  await mobileSession(page, r.token, `/pages/pay/test?order=${order.id}&payment=${paymentId}`);
  await expect(page.locator('[data-test=method]')).toHaveText("Touch 'n Go");
  await expect(page.locator('[data-test=card-form]')).toHaveCount(0);
  await expect(page.locator('[data-test=outcome-success]')).not.toHaveAttribute('disabled', 'true');
});
