import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { mobileSession } from './helpers';

// E5-5: the payment result (O11) shows the accept deadline; the owner gets a message that opens the result again.
test('paid result shows the order and the accept deadline; the message opens it again', async ({ page, browser, request }) => {
  const { token } = await readyToPay(request, browser, true);
  await mobileSession(page, token, '/pages/booking/confirm');
  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await page.locator('[data-test=outcome-success]').click();

  await expect(page).toHaveURL(/\/pages\/orders\/result/);
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');
  await expect(page.locator('[data-test=result-title]')).toHaveClass(/ok/);
  await expect(page.locator('[data-test=result-body]')).toHaveText(
    /^Lim M\. has (2 h 5\d|3 h 0) min left to accept \(until \d{1,2}:\d{2} [ap]m (today|tomorrow)\)\. Paid is not accepted\. The caregiver must accept the whole order in time\.$/,
  );
  const number = (await page.locator('[data-test=order-number]').textContent())!.trim();
  expect(number).toMatch(/^P\d{11,}$/);
  await expect(page.locator('[data-test=order-caregiver]')).toHaveText('Lim M.');
  await expect(page.locator('[data-test=order-amount]')).toHaveText('RM40');
  await expect(page.locator('[data-test=check-again]')).toHaveCount(0);

  // A refresh shows the same server result.
  await page.reload();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');

  await page.goto('http://localhost:5174/pages/messages/index');
  await page.getByText('Payment received: RM40').click();
  await expect(page.locator('[data-test=body]')).toContainText(`Order ${number} is paid. Waiting for Lim M. to accept by `);
  await expect(page.locator('[data-test=latest-summary]')).toHaveText(`Order ${number}: Paid, waiting for the caregiver to accept`);
  await page.locator('[data-test=open-link]').click();
  // R31-1: order messages open the order details (O13) since E7-2.
  await expect(page).toHaveURL(/\/pages\/orders\/detail\?id=\d+/);
  await expect(page.locator('[data-test=order-number]')).toHaveText(number);
});
