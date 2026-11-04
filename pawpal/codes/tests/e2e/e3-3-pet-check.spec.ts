import { expect, test } from '@playwright/test';
import { ADMIN, adminSession, loginOnMobile } from './helpers';
import { addCat, decideInPetCheck, petName } from './pets-helpers';

// E3-3: admins check flagged pets; the owner gets a message that opens the result.
const year = new Date().getFullYear();

test('admin checks a senior pet in the queue and approves it; the owner is told', async ({ page, browser, request }) => {
  const phone = await loginOnMobile(page);
  await page.locator('[data-test=item-E3-1]').click();
  const oldie = petName('Oldie');
  await addCat(page, oldie, { born: year - 14 });

  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  await adminSession(admin, request);
  await admin.goto(ADMIN);
  await admin.locator('[data-test=menu-pets]').click();
  const row = admin.locator('[data-test=pet-queue] tr', { hasText: oldie });
  await expect(row).toContainText(phone.shown);
  await expect(row).toContainText('Senior pet');
  await expect(row).toContainText('Pending check');
  await row.getByRole('button', { name: 'Check' }).click();
  await expect(admin.locator('[data-test=pet-detail]')).toContainText('Senior pet');
  await expect(admin.locator('[data-test=pet-history]')).toContainText('Created → Pending check');

  // Needs info / Not accepted need a reason; Approve does not.
  await admin.locator('[data-test=decision-rejected]').click();
  await expect(admin.locator('[data-test=submit-decision]')).toBeDisabled();
  await decideInPetCheck(admin, oldie, 'approved');
  await expect(admin.locator('[data-test=detail-status]')).toHaveText('Approved');
  await expect(admin.locator('[data-test=decided]')).toBeVisible();
  await expect(admin.locator('[data-test=pet-history]')).toContainText('Pending check → Approved');
  await expect(admin.locator('[data-test=pet-history]')).toContainText('Approved after check');
  await admin.goto(`${ADMIN}/pets`);
  await expect(admin.locator('[data-test=pet-queue] tr', { hasText: oldie })).toHaveCount(0);
  await admin.close();

  // The owner's message opens the pet's status.
  await page.goto('http://localhost:5174/pages/messages/index');
  await page.getByText(`${oldie} is approved`).click();
  await expect(page.locator('[data-test=latest-summary]')).toHaveText(`${oldie}: Approved`);
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(/\/pages\/pets\/status/);
  await expect(page.locator('[data-test=status]')).toHaveText('Approved');
});

test('an admin without the Pet check page cannot open it', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ADMIN}/pets`);
  await expect(page).toHaveURL(/\/no-access/);
  await expect(page.locator('[data-test=menu-pets]')).toHaveCount(0);
});
