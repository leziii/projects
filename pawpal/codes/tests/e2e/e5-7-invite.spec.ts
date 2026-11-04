import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { ADMIN, API, MOBILE, adminSession, mobileSession, newPhone } from './helpers';

async function owner(request: import('@playwright/test').APIRequestContext) {
  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();
  return token as string;
}

// E5-7: Me → Invite friends shows the code; the link fills the code on login; a new friend counts as joined.
test('invite page shows my code, and the link signs a friend up with it', async ({ page, browser, request }) => {
  await mobileSession(page, await owner(request), '/pages/me/index');
  await page.locator('[data-test=item-E5-7]').click();
  await expect(page).toHaveURL(/\/pages\/invite\/index/);
  const code = (await page.locator('[data-test=invite-code-mine]').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(page.locator('[data-test=joined]')).toHaveText('0');
  await expect(page.locator('[data-test=credit]')).toHaveText('No credit yet');
  await expect(page.locator('[data-test=invite-rules]')).toContainText('Only new accounts count');

  const friend = await browser.newPage();
  await friend.setViewportSize({ width: 390, height: 844 });
  await friend.goto(`${MOBILE}/pages/login/index?ref=${code}`);
  await expect(friend.locator('[data-test=invite-code] input')).toHaveValue(code);
  const phone = newPhone();
  await friend.locator('[data-test=phone] input').fill(phone.typed);
  await friend.locator('[data-test=get-code]').click();
  const sms = (/\d{6}/.exec((await friend.locator('[data-test=dev-code]').textContent()) ?? '') ?? [''])[0];
  await friend.locator('[data-test=code] input').fill(sms);
  await friend.locator('[data-test=terms]').click();
  await friend.locator('[data-test=login]').click();
  await expect(friend.locator('.uni-modal')).toContainText('Invite code saved');
  await friend.locator('.uni-modal__btn_primary').click();
  await expect(friend).not.toHaveURL(/login/);
  await friend.close();

  await page.reload();
  await expect(page.locator('[data-test=joined]')).toHaveText('1');
  await expect(page.locator('[data-test=rewarded]')).toHaveText('0');
});

// R24-2: a number that already had an account still logs in, and is told the code was not used (server test covers the real case).
test('an old account is told plainly that the invite code was not used, in English even on a Chinese phone', async ({ browser, request }) => {
  const zh = await browser.newContext({ locale: 'zh-CN' });
  const page = await zh.newPage();
  const inviter = await owner(request);
  const { code } = await (await request.get(`${API}/invite`, { headers: { authorization: `Bearer ${inviter}` } })).json();
  await page.route('**/api/auth/login', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), invite: 'old_account' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${MOBILE}/pages/login/index?ref=${code}`);
  await page.locator('[data-test=phone] input').fill(newPhone().typed);
  await page.locator('[data-test=get-code]').click();
  const sms = (/\d{6}/.exec((await page.locator('[data-test=dev-code]').textContent()) ?? '') ?? [''])[0];
  await page.locator('[data-test=code] input').fill(sms);
  await page.locator('[data-test=terms]').click();
  await page.locator('[data-test=login]').click();
  await expect(page.locator('.uni-modal')).toContainText('This number already has a PawPal account, so the invite code was not used.');
  await expect(page.locator('.uni-modal__btn_primary')).toHaveText('OK');
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page).not.toHaveURL(/login/);
  await zh.close();
});

test('a wrong invite code is refused at sign-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${MOBILE}/pages/login/index?ref=nope`);
  await page.locator('[data-test=phone] input').fill(newPhone().typed);
  await page.locator('[data-test=get-code]').click();
  const sms = (/\d{6}/.exec((await page.locator('[data-test=dev-code]').textContent()) ?? '') ?? [''])[0];
  await page.locator('[data-test=code] input').fill(sms);
  await page.locator('[data-test=terms]').click();
  await page.locator('[data-test=login]').click();
  await expect(page.locator('[data-test=error]')).toHaveText('This invite code is not valid. Check it, or leave it empty');
});

// R24-4, R24-5: the friend's first order is settled → RM10 to both; the friend's next booking uses it on O10.
test('after the first order is settled both get RM10, and it is used on the next booking', async ({ page, browser, request }) => {
  const inviter = await owner(request);
  const { code } = await (await request.get(`${API}/invite`, { headers: { authorization: `Bearer ${inviter}` } })).json();
  const { token, cat, caregiverId, headers } = await readyToPay(request, browser, true, code);

  await mobileSession(page, token, '/pages/booking/confirm');
  await expect(page.locator('[data-test=credit-used]')).toHaveCount(0);
  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await page.locator('[data-test=outcome-success]').click();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM40');
  const number = (await page.locator('[data-test=order-number]').textContent())!.trim();

  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=settle-number]').fill(number);
  await admin.locator('[data-test=settle-run]').click();
  await expect(admin.locator('.el-message')).toContainText(`Order ${number} settled · invite credit given to both`);
  await admin.close();

  const mine = await browser.newPage();
  await mobileSession(mine, inviter, '/pages/invite/index');
  await expect(mine.locator('[data-test=rewarded]')).toHaveText('1');
  await expect(mine.locator('[data-test=credit]')).toContainText('RM10 credit · use by');
  await mine.close();

  const day = new Date(Date.now() + 8 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  expect((await request.post(`${API}/bookings/draft`, { headers, data: { petIds: [cat.id], visits: [{ date: day, start: 600 }] } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/caregiver`, { headers, data: { caregiverId } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/entry`, { headers, data: { method: 'live_confirm' } })).ok()).toBe(true);
  await page.goto(`${MOBILE}/pages/booking/confirm`);
  await expect(page.locator('[data-test=total]')).toHaveText('RM40');
  await expect(page.locator('[data-test=credit-used]')).toHaveText('−RM10');
  await expect(page.locator('[data-test=pay-total]')).toHaveText('RM30');
  await expect(page.locator('[data-test=pay]')).toHaveText('Pay RM30');
  await page.locator('[data-test=health]').click();
  await page.locator('[data-test=pay]').click();
  await expect(page.locator('[data-test=amount]')).toHaveText('RM30');
  await page.locator('[data-test=outcome-success]').click();
  await expect(page.locator('[data-test=result-title]')).toHaveText('Paid RM30');
  await expect(page.locator('[data-test=order-credit]')).toHaveText('−RM10');
});
