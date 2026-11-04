import { expect, test } from '@playwright/test';
import { submittedApplication } from './caregiver-helpers';
import { ADMIN, API, adminSession, mobileSession } from './helpers';

// E4-6: owners see the caregiver card (O08) with badges from the admin's ticks, and the insurance note only when switched on.
test('caregiver previews the card; badges show; insurance note appears only after admin switches it on', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  const { header } = await adminSession(admin, request);
  const c = await submittedApplication(request, `Mei Ling ${Math.floor(Math.random() * 1e5)} Tan`);
  const { id } = await (await request.get(`${API}/auth/me`, { headers: c.headers })).json();
  expect((await request.post(`${API}/admin/caregivers/${id}/decision`, { headers: header, data: { status: 'approved', idChecked: true, certChecked: true } })).ok()).toBe(true);
  expect((await request.post(`${API}/admin/insurance`, { headers: header, data: { on: false, note: '', reason: 'e2e start' } })).ok()).toBe(true);

  // Caregiver: Profile → Preview.
  await mobileSession(page, c.token, '/pages/caregiver/profile');
  await page.locator('[data-test=preview-card]').click();
  await expect(page).toHaveURL(new RegExp(`/pages/caregivers/detail\\?id=${id}`));
  await expect(page.locator('[data-test=preview-note]')).toBeVisible();
  await expect(page.locator('[data-test=card-name]')).toHaveText('Mei T.');
  await expect(page.locator('[data-test=card-initials]')).toHaveText('MT');
  await expect(page.locator('[data-test=card-experience]')).toHaveText('2 years experience');
  await expect(page.locator('[data-test=card-cares-for]')).toHaveText('Cats · Dogs up to Small (under 10 kg)');
  await expect(page.locator('[data-test=card-areas]')).toHaveText('Bangsar');
  await expect(page.locator('[data-test=badge-cert]')).toHaveText('✓ Certificate checked');
  await page.locator('[data-test=badge-id]').click();
  await expect(page.locator('[data-test=badge-info]')).toHaveText("PawPal checked this caregiver's IC and a selfie before approving them.");
  await expect(page.locator('[data-test=card-insurance]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(c.phone.shown);

  // Admin: Rules → Insurance note on.
  await admin.goto(`${ADMIN}/rules`);
  const save = admin.locator('[data-test=insurance-save]');
  await expect(save).toBeDisabled();
  await admin.locator('[data-test=insurance-on]').click();
  await expect(admin.locator('[data-test=insurance-hint]')).toHaveText('Write what the insurance covers (at least 5 characters)');
  await admin.locator('textarea[data-test=insurance-note]').fill('Pet injury cover up to RM5,000 per visit');
  await admin.locator('input[data-test=insurance-reason]').fill('Policy signed with insurer');
  await save.click();
  await expect(admin.locator('.el-message--success', { hasText: 'Insurance note is on' })).toBeVisible();
  await expect(admin.locator('[data-test=insurance-history] tbody tr').first()).toContainText('off → on');
  await admin.close();

  await page.reload();
  await expect(page.locator('[data-test=card-insurance]')).toContainText('Pet injury cover up to RM5,000 per visit');

  expect((await request.post(`${API}/admin/insurance`, { headers: header, data: { on: false, note: '', reason: 'e2e clean-up' } })).ok()).toBe(true);
});

test('an owner sees no badge for an unchecked caregiver, and nothing for a suspended one', async ({ page, request }) => {
  const owner = await submittedApplication(request, 'Owner Test');
  const t = await submittedApplication(request, 'Unverified Person');
  const { id } = await (await request.get(`${API}/auth/me`, { headers: t.headers })).json();
  // Test tools approval skips the ID check, so there is no badge.
  expect((await request.post(`${API}/dev/caregiver-status`, { data: { phone: t.phone.e164, status: 'approved', reason: 'e2e setup' } })).ok()).toBe(true);
  await mobileSession(page, owner.token, `/pages/caregivers/detail?id=${id}`);
  await expect(page.locator('[data-test=card-name]')).toHaveText('Unverified P.');
  await expect(page.locator('[data-test=preview-note]')).toHaveCount(0);
  await expect(page.locator('[data-test^=badge-]')).toHaveCount(0);

  expect((await request.post(`${API}/dev/caregiver-status`, { data: { phone: t.phone.e164, status: 'suspended', reason: 'e2e setup' } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-test=card-gone]')).toBeVisible();
});
