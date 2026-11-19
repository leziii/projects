import { expect, test } from '@playwright/test';
import { bookedOrder as booked } from './booking-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

// E12-3 R51-1 … R51-5: A09 lists the visit; A10 shows both sides; a reason is required; both sides see Decided.
test('admin decides an exception with both sides shown; owner and caregiver see the decision', async ({ page, browser, request }) => {
  const { r, order } = await booked(request, browser, false);
  const cgBase = `${API}/caregiver/tasks/${order.id}/0/problem`;
  expect((await request.post(cgBase, { headers: r.caregiver.headers, data: { kind: 'no_entry', description: 'Gate locked', contacts: [{ method: 'called', note: 'no answer' }] } })).ok()).toBe(true);
  expect((await request.post(`${cgBase}/photos`, { headers: r.caregiver.headers, multipart: { photo: { name: 'gate.png', mimeType: 'image/png', buffer: PNG } } })).ok()).toBe(true);
  const visit = `${API}/orders/${order.id}/visits/0`;
  expect((await request.post(`${visit}/case`, { headers: r.headers, multipart: { kind: 'late', description: 'Nobody by 10:20' } })).ok()).toBe(true);
  expect((await request.post(`${visit}/case/notes`, { headers: r.headers, data: { body: 'Gate was open' } })).ok()).toBe(true);

  const admin = await browser.newPage();
  await adminSession(admin, request, ['exceptions']);
  await admin.setViewportSize({ width: 1400, height: 900 });
  await admin.goto(`${ADMIN}/exceptions`);
  const row = admin.locator('[data-test=exceptions] .el-table__row', { hasText: order.number });
  await expect(row).toContainText('Both');
  await expect(row).toContainText("Can't get in · Late");
  await expect(row.locator('.el-tag')).toHaveText('To decide');
  await row.locator('[data-test^=exception-open-]').click();
  await expect(admin).toHaveURL(new RegExp(`/exceptions/${order.id}/0$`));

  await expect(admin.locator('[data-test=cg-description]')).toHaveText('Gate locked');
  await expect(admin.locator('[data-test=cg-contact]')).toHaveText([/^Called · no answer · \d{1,2}:\d\d [ap]m$/]);
  await expect(admin.locator('[data-test=cg-photo]')).toHaveAttribute('src', /^blob:/);
  await expect(admin.locator('[data-test=owner-description]')).toHaveText('Nobody by 10:20');
  await expect(admin.locator('[data-test=owner-note]')).toContainText('Gate was open');
  await expect(admin.locator('[data-test=run-status]')).toHaveText('To do');

  // R51-3: the default refund fills in; no reason, no save.
  await admin.locator('[data-test=fault-owner]').click();
  await expect(admin.locator('[data-test=split-note]')).toBeVisible();
  await expect(admin.locator('[data-test=refund-preview]')).toHaveText('= RM0 of RM40');
  await admin.locator('[data-test=fault-caregiver]').click();
  await expect(admin.locator('[data-test=refund-preview]')).toHaveText('= RM40 of RM40');
  await expect(admin.locator('[data-test=fault-substitute] input')).toBeEnabled();
  await expect(admin.locator('[data-test=decision-hint]')).toHaveText('Write the reason for this decision');
  await expect(admin.locator('[data-test=submit-decision]')).toBeDisabled();
  await admin.locator('textarea[data-test=reason]').fill('The caregiver could have called the guard');
  await admin.locator('[data-test=submit-decision]').click();
  await expect(admin.locator('.el-message-box')).toContainText("Caregiver at fault · refund RM40. This can't be undone.");
  await admin.locator('.el-message-box').getByRole('button', { name: 'Submit' }).click();
  const text = 'Caregiver at fault · RM40 refunded to the owner. Reason: The caregiver could have called the guard';
  await expect(admin.locator('[data-test=decided-text]')).toHaveText(text);
  await expect(admin.locator('[data-test=run-status]')).toHaveText('Closed');
  await admin.goto(`${ADMIN}/exceptions`);
  await expect(admin.locator('[data-test=exceptions] .el-table__row', { hasText: order.number }).locator('.el-tag')).toHaveText('Caregiver at fault');
  await admin.close();

  // R51-5: the owner sees Decided on O18; the visit is closed.
  await mobileSession(page, r.token, `/pages/orders/problem?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=case-status]')).toHaveText('Decided');
  await expect(page.locator('[data-test=step-decision]')).toHaveText(/^✓ Decided \d{1,2}:\d\d (am|pm), /);
  await expect(page.locator('[data-test=case-decision]')).toHaveText(text);
  await expect(page.locator('[data-test=add-note]')).toHaveCount(0);
  await expect(page.locator('[data-test=case-photo-add]')).toHaveCount(0);
  await mobileSession(page, r.token, `/pages/orders/visit?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=visit-status]')).toHaveText('Closed');
  await expect(page.locator('[data-test=case-line]')).toHaveText('You raised a problem on this visit. Our team has decided it.');
  await mobileSession(page, r.token, `/pages/orders/refunds?id=${order.id}`);
  await expect(page.locator('body')).toContainText('Visit 1: problem decision');

  // ... and the caregiver on S13.
  await mobileSession(page, r.caregiver.token, `/pages/caregiver/problem?id=${order.id}&i=0`);
  await expect(page.locator('[data-test=report-status]')).toHaveText('Decided');
  await expect(page.locator('[data-test=report-decision]')).toHaveText(text);
});
