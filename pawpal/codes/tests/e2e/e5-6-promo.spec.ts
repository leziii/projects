import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { ADMIN, adminSession, mobileSession } from './helpers';

// E5-6: an admin makes a promo code; the owner applies it on O10 and pays less; the use shows on the admin list.
test('admin makes a code, owner pays less with it, the admin sees the use and turns it off', async ({ page, browser, request }) => {
  const code = `E2E${Math.floor(Math.random() * 1e8)}`;
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/promos`);
  await admin.locator('input[data-test=promo-code]').fill(code.toLowerCase());
  await admin.locator('input[data-test=promo-amount]').fill('10');
  await admin.locator('input[data-test=promo-end]').fill('2030-12-31');
  await admin.locator('input[data-test=promo-uses]').fill('5');
  await expect(admin.locator('[data-test=promo-hint]')).toHaveText('Give a reason (at least 5 characters)');
  await expect(admin.locator('[data-test=promo-create]')).toBeDisabled();
  await admin.locator('input[data-test=promo-reason]').fill('Launch offer');
  await expect(admin.locator('[data-test=promo-hint]')).toHaveText('Ready to create.');
  await admin.locator('[data-test=promo-create]').click();
  const row = admin.locator('[data-test=promo-list] tr', { hasText: code });
  await expect(row).toContainText('RM10 off');
  await expect(row).toContainText('0 / 5 used');
  await expect(row).toContainText('once per owner');

  const { token } = await readyToPay(request, browser, true);
  await mobileSession(page, token, '/pages/booking/confirm');
  await expect(page.locator('[data-test=total]')).toHaveText('RM40');
  await page.locator('[data-test=promo-code] input').fill('NOSUCHCODE');
  await page.locator('[data-test=apply-promo]').click();
  await expect(page.locator('[data-test=promo-error]')).toHaveText('There is no such code');
  await page.locator('[data-test=promo-code] input').fill(code.toLowerCase());
  await page.locator('[data-test=apply-promo]').click();
  await expect(page.locator('[data-test=promo-applied]')).toHaveText(`${code} applied`);
  await expect(page.locator('[data-test=discount]')).toHaveText('−RM10');
  await expect(page.locator('[data-test=pay-total]')).toHaveText('RM30');
  await expect(page.locator('[data-test=pay]')).toHaveText('Pay RM30');

  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await expect(page.locator('[data-test=amount]')).toHaveText('RM30');
  await page.locator('[data-test=outcome-success]').click();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM30');
  await expect(page.locator('[data-test=order-discount]')).toHaveText('−RM10');
  await expect(page.locator('[data-test=order-amount]')).toHaveText('RM30');

  await admin.reload();
  await expect(row).toContainText('1 / 5 used');
  await expect(admin.locator(`[data-test=toggle-${code}]`)).toBeDisabled();
  await expect(admin.locator('[data-test=active-hint]')).toHaveText('Type a reason here first (at least 5 characters), then press Turn off or Turn on.');
  await admin.locator('input[data-test=active-reason]').fill('Budget reached');
  await expect(admin.locator('[data-test=active-hint]')).toHaveText('Now press Turn off or Turn on.');
  await admin.locator(`[data-test=toggle-${code}]`).click();
  await expect(row).toContainText('Off');
  await admin.locator(`[data-test=history-${code}]`).click();
  await expect(admin.locator('[data-test=promo-history] tr', { hasText: 'Budget reached' })).toContainText('on → off');
  await admin.close();
});

test('a code that stops working blocks Pay until it is removed', async ({ page, browser, request }) => {
  const code = `E2E${Math.floor(Math.random() * 1e8)}`;
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.close();
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const made = await request.post('http://localhost:3000/api/admin/promos', { headers: header, data: { code, kind: 'amount', amountSen: 500, startsOn: today, endsOn: '2030-12-31', reason: 'Test code' } });
  const promo = await made.json();

  const { token } = await readyToPay(request, browser, true);
  await mobileSession(page, token, '/pages/booking/confirm');
  await page.locator('[data-test=promo-code] input').fill(code);
  await page.locator('[data-test=apply-promo]').click();
  await expect(page.locator('[data-test=pay-total]')).toHaveText('RM35');
  await request.post(`http://localhost:3000/api/admin/promos/${promo.id}/active`, { headers: header, data: { active: false, reason: 'Ended early' } });

  await page.reload();
  await page.locator('[data-test=health]').click();
  await expect(page.locator('[data-test=problem]')).toContainText(`${code}: This code is turned off`);
  await expect(page.locator('[data-test=fix-promo]')).toHaveText('Remove code ›');
  await expect(page.locator('[data-test=pay]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=fix-promo]').click();
  await expect(page.locator('[data-test=problem]')).toHaveCount(0);
  await expect(page.locator('[data-test=pay]')).toHaveText('Pay RM40');
});
