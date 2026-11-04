import { expect, test } from '@playwright/test';
import { ADMIN, adminSession, loginOnMobile } from './helpers';

// E2-6: the help button opens WhatsApp to support with a short text and no private data.
test('Me page help button opens WhatsApp with the help text only', async ({ page, context }) => {
  await context.route('https://wa.me/**', (route) => route.fulfill({ body: 'WhatsApp' }));
  await loginOnMobile(page);

  const help = page.locator('[data-test=menu-other] [data-test=help-button]');
  await expect(help).toContainText('Help & support');
  const [popup] = await Promise.all([page.waitForEvent('popup'), help.click()]);
  const url = new URL(popup.url());
  expect(url.host).toBe('wa.me');
  expect(url.pathname).toBe('/60123456789');
  expect(url.searchParams.get('text')).toBe('Hi PawPal, I need help.');
});

test('admin rules page shows the support number in use', async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto(`${ADMIN}/rules`);
  await expect(page.locator('[data-test=support-whatsapp]')).toHaveText('WhatsApp: +60 12-345 6789 (placeholder) · set SUPPORT_WHATSAPP in server/.env');
});
