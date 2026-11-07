import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { ADMIN, API, MOBILE, adminSession, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const AT = '\\d{1,2}:\\d\\d (am|pm), \\w{3} \\d{1,2} \\w{3}';

/** A paid, accepted order whose visit 1 report is sent. */
async function reportSent(request: APIRequestContext, browser: Browser) {
  const r = await readyToPay(request, browser, false);
  expect((await request.post(`${API}/bookings/draft/entry`, { headers: r.headers, data: { method: 'pre_authorised', keyLock: 'Code 4821#', guard: '', notes: '' } })).ok()).toBe(true);
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  const base = `${API}/caregiver/tasks/${order.id}/0`;
  expect((await request.post(`${base}/arrive`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${base}/enter`, { headers: r.caregiver.headers })).ok()).toBe(true);
  for (const n of [1, 2, 3]) {
    expect((await request.post(`${base}/photos`, { headers: r.caregiver.headers, multipart: { photo: { name: `p${n}.png`, mimeType: 'image/png', buffer: PNG } } })).ok()).toBe(true);
  }
  for (const item of ['feed', 'water', 'litter']) expect((await request.post(`${base}/check`, { headers: r.caregiver.headers, data: { item, done: true } })).ok()).toBe(true);
  expect((await request.post(`${base}/report`, { headers: r.caregiver.headers })).ok()).toBe(true);
  return { r, order };
}

// E9-2 R40-1: the owner confirms; both sides see Confirmed.
test('owner confirms the report with an OK popup', async ({ page, browser, request }) => {
  const { r, order } = await reportSent(request, browser);
  await mobileSession(page, r.token, `/pages/orders/report?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-deadline]')).toBeVisible();
  // Cancel keeps it waiting.
  await page.locator('[data-test=confirm-report]').click();
  await expect(page.locator('.uni-modal')).toContainText("Confirm visit 1 went well? This can't be undone.");
  await page.locator('.uni-modal__btn_default').click();
  await expect(page.locator('[data-test=confirm-report]')).toBeVisible();
  await page.locator('[data-test=confirm-report]').click();
  await page.locator('.uni-modal__btn_primary').click();
  await expect(page.locator('[data-test=report-confirmed]')).toHaveText(new RegExp(`^✓ Confirmed ${AT} by you$`));
  await expect(page.locator('[data-test=confirm-report]')).toHaveCount(0);
  await expect(page.locator('[data-test=raise-problem]')).toHaveCount(0);

  await page.goto(`${MOBILE}/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Confirmed');
  await expect(page.locator('[data-test=report-ready]')).toHaveCount(0);

  const cg = await browser.newPage();
  await mobileSession(cg, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(cg.locator('[data-test=visit-status]')).toHaveText('Confirmed');
  await expect(cg.locator('[data-test=confirmed-at]')).toHaveText(new RegExp(`^✓ Confirmed ${AT} by the owner$`));
  await cg.close();
});

// R40-2: the admin test tool makes the report 12 h old and it confirms itself.
test('12 h with no answer confirms the visit automatically', async ({ page, browser, request }) => {
  const { r, order } = await reportSent(request, browser);
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=due-number]').fill(order.number);
  await admin.locator('[data-test=due-run]').click();
  await expect(admin.locator('.el-message')).toContainText(`Visit 1 of ${order.number} is now confirmed automatically`);
  await admin.close();

  await mobileSession(page, r.token, `/pages/orders/report?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-confirmed]')).toHaveText(new RegExp(`^✓ Confirmed ${AT} automatically after 12 h$`));
  await page.goto(`${MOBILE}/pages/orders/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=visit-report]')).toHaveText(new RegExp(`^Confirmed ${AT} automatically after 12 h$`));
});

// R40-3 … R40-6: a problem becomes a case; admin starts the review and the owner sees it.
test('owner raises a problem; admin starts the review', async ({ page, browser, request }) => {
  const { r, order } = await reportSent(request, browser);
  await mobileSession(page, r.token, `/pages/orders/report?id=${order.id}&i=0`);
  // KF hand test: Raise a problem is red, not green.
  const red = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pp-danger').trim());
  const color = await page.locator('[data-test=raise-problem]').evaluate((el) => getComputedStyle(el).color);
  const probe = await page.evaluate((c) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, red);
  expect(color).toBe(probe);
  await page.locator('[data-test=raise-problem]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/problem\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test=hint]')).toHaveText('Choose what went wrong');
  await expect(page.locator('[data-test=send-case]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=kind-report]').click();
  await expect(page.locator('[data-test=hint]')).toHaveText('Describe the problem');
  await page.locator('[data-test=description] textarea').fill('The litter box was not cleaned');
  await expect(page.locator('[data-test=description-count]')).toHaveText('30 / 500');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=add-photo]').click()]);
  await chooser.setFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-test=new-photo]')).toHaveCount(1);
  await page.locator('[data-test=send-case]').click();

  await expect(page.locator('[data-test=case-status]')).toHaveText('Sent');
  await expect(page.locator('[data-test=case-description]')).toHaveText('The litter box was not cleaned');
  await expect(page.locator('[data-test=case-photo] img')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('[data-test=step-sent]')).toHaveText(new RegExp(`^✓ Sent ${AT}$`));
  await expect(page.locator('[data-test=step-review]')).toHaveText('○ Under review');

  await page.goto(`${MOBILE}/pages/orders/report?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-disputed]')).toHaveText('Under review: you raised a problem.');
  await expect(page.locator('[data-test=confirm-report]')).toHaveCount(0);
  await page.goto(`${MOBILE}/pages/orders/detail?id=${order.id}`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Under review');

  const cg = await browser.newPage();
  await mobileSession(cg, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(cg.locator('[data-test=visit-status]')).toHaveText('Under review');
  await expect(cg.locator('[data-test=disputed]')).toHaveText('The owner raised a problem. Our team is reviewing it and may contact you.');
  await cg.close();

  const admin = await browser.newPage();
  await adminSession(admin, request, ['cases']);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/cases`);
  const row = admin.locator('[data-test=cases] .el-table__row', { hasText: order.number });
  await expect(row).toContainText('Report problem');
  await expect(row).toContainText('The litter box was not cleaned');
  await expect(row).toContainText('On hold');
  await expect(row.locator('.el-tag')).toHaveText('Sent');
  await row.locator('button', { hasText: 'Start review' }).click();
  await expect(row.locator('.el-tag')).toHaveText('Under review');
  await expect(row.locator('button')).toHaveCount(0);
  await admin.close();

  await page.goto(`${MOBILE}/pages/orders/problem?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=case-status]')).toHaveText('Under review');
  await expect(page.locator('[data-test=step-review]')).toHaveText(new RegExp(`^✓ Under review since ${AT}$`));
});
