import { expect, test } from '@playwright/test';
import { ADMIN, API, MOBILE, adminSession, loginOnMobile } from './helpers';

// E2-5: a new request reaches the caregiver by push AND WhatsApp/SMS, without an address; reminder before the deadline.
test('caregiver turns on alerts; a request alert arrives on push, WhatsApp and in Messages', async ({ page, browser, request }) => {
  // Headless browsers have no real push service or notification permission:
  // the browser "allows" notifications and subscriptions point at the server's test push inbox instead.
  const endpoint = `https://push.test.pawpal/e2e-${Date.now()}`;
  await page.addInitScript((ep) => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Notification.requestPermission = async () => 'granted';
    // The fake subscription lives in sessionStorage, so it survives page loads like a real one.
    const KEY = 'e2e.push';
    const fake = {
      endpoint: ep,
      toJSON: () => ({ endpoint: ep, keys: { p256dh: 'BTestKeyForE2E', auth: 'TestAuth' } }),
      unsubscribe: async () => (sessionStorage.removeItem(KEY), true),
    } as unknown as PushSubscription;
    PushManager.prototype.getSubscription = async () => (sessionStorage.getItem(KEY) ? fake : null);
    PushManager.prototype.subscribe = async () => (sessionStorage.setItem(KEY, '1'), fake);
  }, endpoint);

  const phone = await loginOnMobile(page);
  expect((await request.post(`${API}/dev/caregiver-status`, { data: { phone: phone.e164, status: 'approved', reason: 'IC checked' } })).ok()).toBe(true);
  await page.goto(`${MOBILE}/pages/role/index`);
  await page.locator('[data-test=pick-caregiver]').click();
  await page.locator('[data-test=switch]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/index/);

  const card = page.locator('[data-test=alerts]');
  await expect(card.locator('[data-test=push-state]')).toHaveText('Off');
  await card.locator('[data-test=push-toggle]').click();
  await expect(card.locator('[data-test=push-state]')).toHaveText('On');
  await card.locator('[data-test=test-alert]').click();
  await expect(card.locator('[data-test=test-result]')).toHaveText('Test alert: Push: sent · WhatsApp: sent');

  // Admin sends a booking request alert (stand-in for E6-1).
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=ra-phone]').fill(phone.typed);
  await admin.locator('[data-test=ra-send]').click();
  await expect(admin.getByText('Alert sent: Push sent · WhatsApp sent · reminder set')).toBeVisible();
  await expect(admin.locator('[data-test=alert-log] .el-table__body tr').first()).toContainText('whatsapp');

  // Without WhatsApp the text goes by SMS.
  await admin.locator('[data-test=ra-no-whatsapp]').click();
  await admin.locator('[data-test=ra-send]').click();
  await expect(admin.getByText('Alert sent: Push sent · WhatsApp failed · SMS sent · reminder set')).toBeVisible();
  await admin.close();

  const inbox = await (await request.get(`${API}/dev/push-inbox?endpoint=${encodeURIComponent(endpoint)}`)).json();
  expect(inbox.map((p: { title: string }) => p.title)).toEqual(['Test alert', 'Urgent booking request · 24 min left', 'Urgent booking request · 24 min left']);
  expect(inbox[1].body).toBe('First visit 10/28 09:00, 3 visits, Mont Kiara. Open PawPal to accept.');

  // Tapping the push opens this message; it is also in the message centre.
  await page.goto(`${MOBILE}${inbox[1].url}`);
  await expect(page.locator('[data-test=title]')).toHaveText('Urgent booking request · 24 min left');

  // Turning push off stops push; WhatsApp/SMS still on.
  await page.goto(`${MOBILE}/pages/caregiver/index`);
  await card.locator('[data-test=push-toggle]').click();
  await expect(card.locator('[data-test=push-state]')).toHaveText('Off');
  await card.locator('[data-test=test-alert]').click();
  await expect(card.locator('[data-test=test-result]')).toHaveText('Test alert: Push: off · WhatsApp: failed · SMS: sent');
});

test('an address in a request alert is refused', async ({ page, request }) => {
  const phone = await loginOnMobile(page);
  await request.post(`${API}/dev/caregiver-status`, { data: { phone: phone.e164, status: 'approved', reason: 'IC checked' } });
  await adminSession(page, request);
  await page.setViewportSize({ width: 1280, height: 800 }); // the admin console is a desktop page
  await page.goto(`${ADMIN}/test-tools`);
  await page.locator('input[data-test=ra-phone]').fill(phone.typed);
  await page.locator('input[data-test=ra-area]').fill('12 Jalan Ampang');
  await page.locator('[data-test=ra-send]').click();
  // The error pop-up, not the hint text on the same page that says the same words.
  await expect(page.locator('.el-message--error')).toContainText('Messages must not contain an address');
});
