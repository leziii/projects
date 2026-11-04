import { expect, test } from '@playwright/test';
import { adminSession, loginOnMobile } from './helpers';
import { addCat, decideInPetCheck, petName } from './pets-helpers';

// E3-2: the owner sees each of the 4 statuses with what to do next.
const year = new Date().getFullYear();

test('approved, pending check, needs info and not accepted each show the right page', async ({ page, browser, request }) => {
  await loginOnMobile(page);
  await page.locator('[data-test=item-E3-1]').click();
  const [mimi, oldie, noshot] = [petName('Mimi'), petName('Oldie'), petName('Noshot')];
  await addCat(page, mimi);
  await addCat(page, oldie, { born: year - 14 });
  await addCat(page, noshot, { vaccinated: false });
  const status = (name: string) => page.locator('[data-test=pet]', { hasText: name }).locator('[data-test=pet-status]');
  await expect(status(mimi)).toHaveText('Approved');
  await expect(status(oldie)).toHaveText('Pending check');

  // Pending: reasons and "payment waits".
  await page.locator('[data-test=pet]', { hasText: oldie }).click();
  await expect(page.locator('[data-test=status]')).toHaveText('Pending check');
  await expect(page.locator('[data-test=status-help]')).toContainText('payment waits until the check is done');
  await expect(page.locator('[data-test=check-reasons]')).toContainText('Senior pet');
  await page.goBack();

  // Admin asks for more info on one pet and turns the other down.
  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  await adminSession(admin, request);
  await decideInPetCheck(admin, oldie, 'needs_info', 'Please add a vet check from this year');
  await decideInPetCheck(admin, noshot, 'rejected', 'Not suitable for home visits');
  await admin.close();

  await page.reload();
  await expect(status(oldie)).toHaveText('Needs info');
  await expect(status(noshot)).toHaveText('Not accepted');

  // Not accepted: the reason, no update button, support instead.
  await page.locator('[data-test=pet]', { hasText: noshot }).click();
  await expect(page.locator('[data-test=status-help]')).toHaveText('This pet cannot be booked. See the reason below.');
  await expect(page.locator('[data-test=admin-note]')).toContainText('Not suitable for home visits');
  await expect(page.locator('[data-test=update]')).toHaveCount(0);
  await expect(page.locator('[data-test=help-button]')).toBeVisible();
  await page.goBack();

  // Needs info: what is needed; updating the profile sends it back to the check.
  await page.locator('[data-test=pet]', { hasText: oldie }).click();
  await expect(page.locator('[data-test=admin-note]')).toContainText('Please add a vet check from this year');
  await page.locator('[data-test=update]').click();
  await expect(page.locator('[data-test=edit-admin-note]')).toContainText('Please add a vet check from this year');
  await page.locator('[data-test=health-note] textarea').fill('Vet check done this month, all fine');
  await page.locator('[data-test=confirm]').click();
  await page.locator('[data-test=save]').click();
  await expect(page.locator('[data-test=status]')).toHaveText('Pending check');
  await expect(page.locator('[data-test=admin-note]')).toHaveCount(0);
});
