import { expect, test, type Page } from '@playwright/test';
import { MOBILE, loginOnMobile } from './helpers';

// E4-1: a user applies to be a caregiver; missing items block submit; the draft reloads; submit locks it.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

async function addPhoto(page: Page, kind: string) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`[data-test=add-${kind}]`).click()]);
  await chooser.setFiles({ name: `${kind}.jpg`, mimeType: 'image/jpeg', buffer: JPEG });
  await expect(page.locator(`[data-test=file-${kind}]`)).toHaveCount(1);
}

test('caregiver application: draft reloads, missing items block submit, submit locks it', async ({ page }) => {
  await loginOnMobile(page);
  await page.locator('[data-test=switch-role]').click();
  await page.locator('[data-test=apply]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/index/);

  const submit = page.locator('[data-test=submit]');
  const missing = page.locator('[data-test=missing]');
  await expect(submit).toHaveAttribute('disabled', /.*/);
  await expect(missing).toContainText('Full name');
  await expect(missing).toContainText('Selfie holding your IC');

  // Part of the form, saved as a draft, comes back after a reload.
  await page.locator('[data-test=full-name] input').fill('Siti Aminah');
  await page.locator('[data-test=ic] input').fill('900101145678');
  await page.locator('[data-test=years] input').fill('3');
  await page.locator('[data-test=dogs]').click();
  await expect(missing).toContainText('Largest dog size');
  await page.locator('[data-test=size-medium]').click();
  await page.locator('[data-test="area-Bangsar"]').click();
  await page.locator('[data-test=save-draft]').click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-test=full-name] input')).toHaveValue('Siti Aminah');
  await expect(page.locator('[data-test=ic] input')).toHaveValue('900101-14-5678');
  await expect(page.locator('[data-test=size-medium]')).toHaveClass(/on/);
  await expect(page.locator('[data-test="area-Bangsar"]')).toHaveClass(/on/);
  await expect(missing).not.toContainText('Full name');

  // Photos and the care guide; ticking the box first opens the guide.
  await addPhoto(page, 'ic_front');
  await addPhoto(page, 'ic_back');
  await addPhoto(page, 'selfie');
  await page.locator('[data-test=guide-read]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/guide/);
  await page.locator('[data-test=guide-done]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/index/);
  await expect(page.locator('[data-test=guide-read]')).toHaveAttribute('aria-checked', 'true');

  await expect(missing).toHaveCount(0);
  await expect(submit).not.toHaveAttribute('disabled', /.*/);
  await submit.click();

  // Sent: the status page (S03) shows it; the form no longer opens for changes.
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
  await expect(page.locator('[data-test=app-status]')).toHaveText('Under review');
  await expect(page.locator('[data-test=sent]')).toContainText('Sent');
  await expect(page.locator('[data-test=fix]')).toHaveCount(0);
  await page.goto(`${MOBILE}/pages/apply/index`);
  await expect(page).toHaveURL(/\/pages\/apply\/status/);

  // The role page shows the review; the message opens the application.
  await page.goto(`${MOBILE}/pages/role/index`);
  await expect(page.locator('[data-test=caregiver-tag]')).toHaveText('Under review');
  await page.locator('[data-test=view-application]').click();
  await expect(page.locator('[data-test=app-status]')).toHaveText('Under review');
  await page.goto(`${MOBILE}/pages/messages/index`);
  await page.getByText('Application received').click();
  await page.locator('[data-test=open-link]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
});
