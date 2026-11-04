import { expect, test } from '@playwright/test';
import { approvedCaregiver } from './caregiver-helpers';
import { ADMIN, adminSession, mobileSession } from './helpers';

// E4-4: caregivers edit profile and area; a larger dog size and a new photo go to admin review first.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

test('areas and intro save at once; larger dogs and a new photo wait for review, then approve', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  const { header } = await adminSession(admin, request);
  const c = await approvedCaregiver(request, header, `Nur Aisyah ${Math.floor(Math.random() * 1e5)} Rahman`);

  await mobileSession(page, c.token, '/pages/me/index');
  await page.locator('[data-test=item-E4-4]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/profile/);
  await expect(page.locator('[data-test=display-name]')).toHaveText('Nur R.');

  // Instant: area and intro.
  await page.locator('[data-test="area-KLCC"]').click();
  await page.locator('[data-test=intro] textarea').fill('Calm with shy cats');
  await page.locator('[data-test=save]').click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-test="area-KLCC"]')).toHaveClass(/on/);
  await expect(page.locator('[data-test=intro] textarea')).toHaveValue('Calm with shy cats');
  await expect(page.locator('[data-test=pending]')).toHaveCount(0);

  // Review: larger dogs and a new photo.
  await page.locator('[data-test=size-large]').click();
  await expect(page.locator('[data-test=review-hint]')).toContainText('needs review');
  await page.locator('[data-test=save]').click();
  await expect(page.locator('[data-test=pending]')).toContainText('Dogs up to Large');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=add-photo]').click()]);
  await chooser.setFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await expect(page.locator('[data-test=pending]')).toContainText('new photo');
  await expect(page.locator('[data-test=pending-photo]')).toBeVisible();

  // Admin: Profile changes → Approve.
  await admin.goto(`${ADMIN}/caregivers`);
  await admin.locator('[data-test=filter-changes]').click();
  const row = admin.locator('[data-test=change-list] tr', { hasText: c.phone.shown });
  await expect(row).toContainText('Dogs up to Large (over 25 kg) · New photo');
  await row.getByRole('button', { name: 'Review' }).click();
  await expect(admin.locator('[data-test=asked-ability]')).toHaveText('Dogs up to Large (over 25 kg)');
  await expect(admin.locator('[data-test=pending-photo]')).toBeVisible();
  await expect(admin.locator('[data-test=selfie-photo]')).toBeVisible();
  await admin.locator('[data-test=decision-rejected]').click();
  await expect(admin.locator('[data-test=submit-decision]')).toBeDisabled();
  await admin.locator('[data-test=decision-approved]').click();
  await admin.locator('[data-test=submit-decision]').click();
  await expect(admin.locator('.el-message--success', { hasText: 'The caregiver has been told' })).toBeVisible();
  await expect(admin.locator('[data-test=change-list] tr', { hasText: c.phone.shown })).toHaveCount(0);
  await admin.close();

  await page.reload();
  await expect(page.locator('[data-test=pending]')).toHaveCount(0);
  await expect(page.locator('[data-test=current-photo]')).toBeVisible();
  await expect(page.getByText('Now: Cats · Dogs up to Large (over 25 kg)')).toBeVisible();
});

test('not approved: the reason shows and the old details stay', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  const { header } = await adminSession(admin, request);
  const c = await approvedCaregiver(request, header, 'Kumar Raj');
  expect((await request.post('http://localhost:3000/api/caregiver/profile', { headers: c.headers, data: { cats: true, dogs: true, maxDogSize: 'medium', areas: ['Bangsar'], experienceYears: 2 } })).ok()).toBe(true);

  await admin.goto(`${ADMIN}/caregivers/${c.id}/change`);
  await admin.locator('[data-test=decision-rejected]').click();
  await admin.locator('textarea[data-test=decision-note]').fill('Tell us about your medium dog experience first');
  await admin.locator('[data-test=submit-decision]').click();
  await expect(admin.locator('.el-message--success', { hasText: 'The caregiver has been told' })).toBeVisible();
  await admin.close();

  await mobileSession(page, c.token, '/pages/caregiver/profile');
  await expect(page.locator('[data-test=rejected-reason]')).toHaveText('Tell us about your medium dog experience first');
  await expect(page.getByText('Now: Cats · Dogs up to Small (under 10 kg)')).toBeVisible();
});
