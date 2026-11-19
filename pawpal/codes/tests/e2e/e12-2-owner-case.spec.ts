import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const AT = '\\d{1,2}:\\d\\d (am|pm), \\w{3} \\d{1,2} \\w{3}';

// E12-2 R50-1 … R50-4: before the visit, the owner reports from the visit page and follows the timeline on O18.
test('owner reports a problem before the visit, adds a note and photo, and follows the timeline', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  // The caregiver reported on the same visit first.
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/problem`, { headers: r.caregiver.headers, data: { kind: 'no_entry', description: 'Gate locked' } })).ok()).toBe(true);

  await mobileSession(page, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=report-problem]').click();
  await expect(page).toHaveURL(new RegExp(`pages/orders/problem\\?id=${order.id}&i=0`));
  await expect(page.locator('[data-test^=kind-]')).toHaveText(['Late', "Couldn't get in", "Caregiver didn't come", 'Other']);
  await expect(page.locator('[data-test=send-note]')).toContainText('may contact you and the caregiver');
  await page.locator('[data-test=kind-no_show]').click();
  await page.locator('[data-test=description] textarea').fill('Nobody came at 10 am');
  await page.locator('[data-test=send-case]').click();

  await expect(page.locator('[data-test=case-status]')).toHaveText('Sent');
  // KF hand test: the form is gone once sent.
  await expect(page.locator('[data-test=send-case]')).toHaveCount(0);
  await expect(page.locator('[data-test^=kind-]')).toHaveCount(0);
  await expect(page.locator('[data-test=step-sent]')).toHaveText(new RegExp(`^✓ Sent ${AT}$`));
  await expect(page.locator('[data-test=step-review]')).toHaveText('○ Under review');
  await expect(page.locator('[data-test=step-decision]')).toHaveText('○ Decided');
  await expect(page.locator('[data-test=case-decision]')).toHaveText('—');
  await expect(page.locator('[data-test=caregiver-report]')).toHaveText(new RegExp(`^Caregiver reported: Can't get in · ${AT}$`));

  // R50-4: a note and a photo while open.
  await expect(page.locator('[data-test=add-note]')).toHaveAttribute('disabled', 'true');
  await page.locator('[data-test=note-input] textarea').fill('I was home all morning');
  await page.locator('[data-test=add-note]').click();
  await expect(page.locator('[data-test=case-note]')).toHaveCount(1);
  await expect(page.locator('[data-test=case-note]')).toContainText('I was home all morning');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=case-photo-add]').click()]);
  await chooser.setFiles({ name: 'door.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-test=case-photo] img')).toHaveAttribute('src', /^blob:/);

  // Admin starts the review; the owner sees it with its time.
  const admin = await browser.newPage();
  await adminSession(admin, request, ['cases']);
  await admin.setViewportSize({ width: 1400, height: 900 });
  await admin.goto(`${ADMIN}/cases`);
  const row = admin.locator('[data-test=cases] .el-table__row', { hasText: order.number });
  await expect(row).toContainText("Caregiver didn't come");
  await row.locator('button', { hasText: 'Start review' }).click();
  await expect(row.locator('.el-tag')).toHaveText('Under review');
  await admin.close();
  await page.reload();
  await expect(page.locator('[data-test=case-status]')).toHaveText('Under review');
  await expect(page.locator('[data-test=step-review]')).toHaveText(new RegExp(`^✓ Under review since ${AT}$`));

  // The visit page now leads to the case.
  await mobileSession(page, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-problem]')).toHaveCount(0);
  await expect(page.locator('[data-test=case-line]')).toHaveText('You raised a problem on this visit. Our team is looking at it.');
  await page.locator('[data-test=view-case]').click();
  await expect(page.locator('[data-test=case-note]')).toHaveCount(1);
});

// R50-1: once the visit is confirmed there is nothing to raise.
test('no Report a problem once the visit is confirmed', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  await mobileSession(page, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-problem]')).toBeVisible();

  const base = `${API}/caregiver/tasks/${order.id}/0`;
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  expect((await request.post(`${base}/arrive`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  for (const n of [1, 2, 3]) {
    expect((await request.post(`${base}/photos`, { headers: r.caregiver.headers, multipart: { photo: { name: `p${n}.png`, mimeType: 'image/png', buffer: PNG } } })).ok()).toBe(true);
  }
  const task = (await (await request.get(base, { headers: r.caregiver.headers })).json()) as { checklist: { item: string }[] };
  for (const { item } of task.checklist) expect((await request.post(`${base}/check`, { headers: r.caregiver.headers, data: { item, done: true } })).ok()).toBe(true);
  expect((await request.post(`${base}/report`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm`, { headers: r.headers })).ok()).toBe(true);

  await page.reload();
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Confirmed');
  await expect(page.locator('[data-test=report-problem]')).toHaveCount(0);
  await expect(page.locator('[data-test=view-case]')).toHaveCount(0);
});
