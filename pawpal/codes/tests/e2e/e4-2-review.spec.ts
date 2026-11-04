import { expect, test } from '@playwright/test';
import { submittedApplication } from './caregiver-helpers';
import { ADMIN, MOBILE, adminSession, mobileSession } from './helpers';

// E4-2: admins review applications; every decision reaches the caregiver with its reason.
const name = (base: string) => `${base} ${Math.floor(Math.random() * 1e5)}`;

test('needs info with a reason, the caregiver fixes it, then approve with the IC tick', async ({ page, browser, request }) => {
  const siti = name('Siti');
  const c = await submittedApplication(request, siti);

  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  await adminSession(admin, request);
  await admin.goto(ADMIN);
  await admin.locator('[data-test=menu-caregivers]').click();
  const row = admin.locator('[data-test=review-list] tr', { hasText: siti });
  await expect(row).toContainText(c.phone.shown);
  await expect(row).toContainText('Complete');
  await row.getByRole('button', { name: 'Review' }).click();

  // IC masked until Show, which is recorded; photos load on request.
  await expect(admin.locator('[data-test=ic]')).toHaveText(`******-**-${c.ic.slice(-4)}`);
  await admin.locator('[data-test=show-ic]').click();
  await expect(admin.locator('[data-test=ic]')).toHaveText(`${c.ic.slice(0, 6)}-${c.ic.slice(6, 8)}-${c.ic.slice(8)}`);
  await expect(admin.locator('[data-test=ic-views]')).toContainText('Full IC shown');
  await admin.locator('[data-test=show-selfie]').click();
  await expect(admin.locator('[data-test=photo-selfie]')).toBeVisible();

  // Needs info needs a reason.
  const submit = admin.locator('[data-test=submit-decision]');
  await admin.locator('[data-test=decision-needs_info]').click();
  await expect(submit).toBeDisabled();
  await admin.locator('textarea[data-test=decision-note]').fill('Please retake the IC back photo');
  await submit.click();
  await expect(admin.locator('.el-message--success', { hasText: 'The caregiver has been told' })).toBeVisible();
  await expect(admin.locator('[data-test=detail-status]')).toHaveText('Needs info');

  // The caregiver sees the reason and sends it again.
  await mobileSession(page, c.token, '/pages/messages/index');
  await page.getByText('More info needed for your application').click();
  await expect(page.locator('[data-test=body]')).toContainText('Please retake the IC back photo');
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
  await expect(page.locator('[data-test=admin-note]')).toHaveText('Please retake the IC back photo');
  await page.locator('[data-test=fix]').click();
  await expect(page.locator('[data-test=review-note] [data-test=admin-note]')).toHaveText('Please retake the IC back photo');
  await page.locator('[data-test=submit]').click();
  await expect(page.locator('[data-test=app-status]')).toHaveText('Under review');

  // Approve needs the IC tick.
  await admin.reload();
  await admin.locator('[data-test=decision-approved]').click();
  await expect(submit).toBeDisabled();
  await expect(admin.locator('[data-test=decision-hint]')).toContainText('Tick');
  await admin.locator('[data-test=id-checked]').click();
  await submit.click();
  await expect(admin.locator('[data-test=detail-status]')).toHaveText('Approved');
  await expect(admin.locator('[data-test=app-history]')).toContainText('Under review → Approved');
  await expect(admin.locator('[data-test=app-history]')).toContainText('IC and selfie match');
  await admin.locator('[data-test=back]').click();
  await admin.locator('[data-test=filter-approved]').click();
  await expect(admin.locator('[data-test=review-list] tr', { hasText: siti })).toBeVisible();
  await admin.close();

  // Now a caregiver: the role switch is open.
  await page.goto(`${MOBILE}/pages/messages/index`);
  await expect(page.getByText('You are a PawPal caregiver')).toBeVisible();
  await page.goto(`${MOBILE}/pages/role/index`);
  await expect(page.locator('[data-test=caregiver-tag]')).toHaveText('Approved');
});

test('same IC on another account is flagged and cannot be approved; not approved can apply again', async ({ page, browser, request }) => {
  const first = await submittedApplication(request, name('First'));
  const raj = name('Raj');
  const second = await submittedApplication(request, raj, first.ic);

  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  const { header } = await adminSession(admin, request);
  const list = await (await request.get('http://localhost:3000/api/admin/caregivers', { headers: header })).json();
  const firstId = list.find((r: { phone: string }) => r.phone === first.phone.shown).userId;
  expect((await request.post(`http://localhost:3000/api/admin/caregivers/${firstId}/decision`, { headers: header, data: { status: 'approved', idChecked: true } })).ok()).toBe(true);

  await admin.goto(`${ADMIN}/caregivers`);
  const row = admin.locator('[data-test=review-list] tr', { hasText: raj });
  await expect(row).toContainText('Same IC as another account');
  await row.getByRole('button', { name: 'Review' }).click();
  await expect(admin.locator('[data-test=same-ic]')).toContainText(`${first.phone.shown} (Approved)`);
  await admin.locator('[data-test=id-checked]').click();
  await admin.locator('[data-test=decision-approved]').click();
  await expect(admin.locator('[data-test=submit-decision]')).toBeDisabled();
  await expect(admin.locator('[data-test=decision-hint]')).toHaveText('This IC number is already approved on another account');
  await admin.locator('[data-test=decision-rejected]').click();
  await admin.locator('textarea[data-test=decision-note]').fill('This IC is already registered');
  await admin.locator('[data-test=submit-decision]').click();
  await expect(admin.locator('[data-test=detail-status]')).toHaveText('Not approved');
  await admin.close();

  // The applicant sees why and may fix it and send it again.
  await mobileSession(page, second.token, '/pages/apply/index');
  await expect(page.locator('[data-test=review-note]')).toContainText('Not approved');
  await expect(page.locator('[data-test=admin-note]')).toHaveText('This IC is already registered');
  await expect(page.locator('[data-test=submit]')).toBeVisible();
});

test('an admin without the Caregiver review page cannot open it', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ADMIN}/caregivers`);
  await expect(page).toHaveURL(/\/no-access/);
  await expect(page.locator('[data-test=menu-caregivers]')).toHaveCount(0);
});
