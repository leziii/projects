import { expect, test, type Page } from '@playwright/test';
import { MOBILE, newPhone } from './helpers';

// E2-1: log in with a Malaysian mobile number and an SMS code (mock SMS shows the code on screen).
async function askCode(page: Page, typed: string): Promise<string> {
  await page.locator('[data-test=phone] input').fill(typed);
  await page.locator('[data-test=get-code]').click();
  await expect(page.locator('[data-test=dev-code]')).toContainText(/Test code: \d{6}/);
  return (/\d{6}/.exec((await page.locator('[data-test=dev-code]').textContent()) ?? '') ?? [''])[0];
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('guest opens a page that needs login, logs in, and comes back to it', async ({ page }) => {
  const phone = newPhone();
  await page.goto(`${MOBILE}/pages/me/index`);
  await expect(page).toHaveURL(/\/pages\/login\/index\?redirect=(%25)?2Fpages/);

  const code = await askCode(page, phone.typed);
  await expect(page.locator('[data-test=get-code]')).toContainText(/Resend in \d+ s/);

  await page.locator('[data-test=code] input').fill(code);
  await expect(page.locator('[data-test=login]')).toHaveAttribute('disabled', /.*/); // terms not ticked yet
  await page.locator('[data-test=terms]').click();
  await expect(page.locator('[data-test=login]')).not.toHaveAttribute('disabled', /.*/);

  await page.locator('[data-test=code] input').fill(String((Number(code) + 1) % 1e6).padStart(6, '0'));
  await page.locator('[data-test=login]').click();
  await expect(page.locator('[data-test=error]')).toHaveText('Wrong code. 4 tries left');

  await page.locator('[data-test=code] input').fill(code);
  await page.locator('[data-test=login]').click();
  await expect(page).toHaveURL(/\/pages\/me\/index$/);
  await expect(page.locator('[data-test=my-phone]')).toHaveText(phone.shown);

  // Still logged in after a reload.
  await page.reload();
  await expect(page.locator('[data-test=my-phone]')).toHaveText(phone.shown);

  await page.locator('[data-test=logout]').click();
  await expect(page).toHaveURL(/\/pages\/index\/index$|\/$/);
  await expect(page.locator('[data-test=account]')).toHaveText('Log in');
  await page.goto(`${MOBILE}/pages/me/index`);
  await expect(page).toHaveURL(/\/pages\/login\/index/);
});

test('home "Log in" link; "Not now" keeps browsing prices', async ({ page }) => {
  await page.goto(MOBILE);
  await page.locator('[data-test=account]').click();
  await expect(page).toHaveURL(/\/pages\/login\/index/);
  await page.locator('[data-test=not-now]').click();
  await expect(page.locator('[data-test=prices]')).toContainText('RM40');
});

test('clear messages for a wrong number and for asking too soon', async ({ page }) => {
  await page.goto(`${MOBILE}/pages/login/index`);
  await page.locator('[data-test=phone] input').fill('03-1234 5678');
  await page.locator('[data-test=get-code]').click();
  await expect(page.locator('[data-test=error]')).toHaveText('Enter a Malaysian mobile number, e.g. 012-345 6789');

  const phone = newPhone();
  await askCode(page, phone.typed);
  await page.reload();
  await page.locator('[data-test=phone] input').fill(phone.typed);
  await page.locator('[data-test=get-code]').click();
  await expect(page.locator('[data-test=error]')).toHaveText(/^Please wait \d+ s before asking for a new code$/);
  await expect(page.locator('[data-test=get-code]')).toContainText(/Resend in \d+ s/);
});
