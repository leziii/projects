import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

// A real 2 × 2 PNG, so the phone can shrink it before upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

// E12-1 R49-1 … R49-4: from the visit page, S13 sends a report with a photo and contact tries; the owner is told; admin reviews.
test('caregiver reports a problem with a photo and contact tries; admin starts the review', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  const cg = r.caregiver;
  await mobileSession(page, cg.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await page.locator('[data-test=report-problem]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/problem/);
  await expect(page.locator('[data-test^=kind-]')).toHaveText(['○ Late', "○ Can't get in", "○ Pets don't match booking", "○ Can't do the service"]);
  await expect(page.locator('[data-test=form-problem]')).toHaveText('Choose what went wrong');
  await expect(page.locator('[data-test=send-problem]')).toHaveAttribute('disabled', 'true');

  await page.locator('[data-test=kind-no_entry]').click();
  await expect(page.locator('[data-test=form-problem]')).toHaveText('Describe the problem');
  await page.locator('[data-test=description] textarea').fill('Door code wrong, owner not answering');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=photo-add]').click()]);
  await chooser.setFiles({ name: 'door.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('[data-test=picked-photo]')).toHaveCount(1);
  await page.locator('[data-test=contact-note] input').fill('no answer');
  await page.locator('[data-test=add-contact]').click();
  await expect(page.locator('[data-test=contact-line]')).toHaveText([/^\d{1,2}:\d\d [ap]m · Called: no answer$/]);
  await page.locator('[data-test=send-problem]').click();

  await expect(page.locator('[data-test=report-kind]')).toHaveText("Can't get in");
  await expect(page.locator('[data-test=report-status]')).toHaveText('Sent');
  await expect(page.locator('[data-test=report-decision]')).toHaveText('—');
  await expect(page.locator('[data-test=report-photo] img')).toHaveCount(1);
  // More tries while open; the time is stamped by us.
  await page.locator('[data-test=method-knocked]').click();
  await page.locator('[data-test=add-contact]').click();
  await expect(page.locator('[data-test=contact-line]')).toHaveCount(2);
  await expect(page.locator('[data-test=contact-line]').nth(1)).toHaveText(/ · Knocked$/);

  const { items } = (await (await request.get(`${API}/messages`, { headers: r.headers })).json()) as { items: { title: string }[] };
  expect(items.map((m) => m.title).some((t) => t.endsWith("reported a problem: Can't get in"))).toBe(true);

  // Admin Cases: listed under Caregiver reports; Start review → the caregiver sees Under review.
  const admin = await browser.newPage();
  await adminSession(admin, request, ['cases']);
  await admin.setViewportSize({ width: 1400, height: 900 });
  await admin.goto(`${ADMIN}/cases`);
  const row = admin.locator('[data-test=problems] tr', { hasText: order.number });
  await expect(row).toContainText("Can't get in");
  await row.locator('[data-test^=problem-review-]').click();
  await expect(row.locator('[data-test^=problem-status-]')).toHaveText('Under review');
  await admin.close();
  await page.reload();
  await expect(page.locator('[data-test=report-status]')).toHaveText('Under review');
});

// R49-1: the service page (S11) leads to S13 too.
test('Report a problem opens S13 from the service page', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);
  expect((await request.post(`${API}/caregiver/tasks/${order.id}/0/arrive`, { headers: r.caregiver.headers, data: {} })).ok()).toBe(true);
  expect((await request.post(`${API}/orders/${order.id}/visits/0/confirm-entry`, { headers: r.headers })).ok()).toBe(true);
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/service?id=${order.id}&i=0`);
  await page.locator('[data-test=problem]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/problem\?id=\d+&i=0/);
  await expect(page.locator('[data-test^=kind-]')).toHaveCount(4);
});
