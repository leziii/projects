import { expect, test, type Page } from '@playwright/test';
import { loginOnMobile } from './helpers';

// E3-4: owners save addresses and contacts; one is the default.
async function fillAddress(page: Page, a: { label: string; area: string; street: string; unit: string; postcode: string }) {
  await page.locator('[data-test=label] input').fill(a.label);
  await page.locator('[data-test=area]').selectOption(a.area);
  await page.locator('[data-test=street] input').fill(a.street);
  await page.locator('[data-test=unit] input').fill(a.unit);
  await page.locator('[data-test=postcode] input').fill(a.postcode);
}

test('owner adds two addresses, picks the default, edits and deletes', async ({ page }) => {
  await loginOnMobile(page);
  await page.locator('[data-test=item-E3-4]').click();
  await expect(page).toHaveURL(/\/pages\/addresses\/index/);
  await expect(page.locator('[data-test=no-addresses]')).toBeVisible();

  // Contact and phone are required.
  await page.locator('[data-test=add-address]').click();
  await fillAddress(page, { label: 'Home', area: 'Mont Kiara', street: 'Jalan Kiara 3, Kiara Condo', unit: 'A-12-3', postcode: '50480' });
  // KF hand test (E8-6): everything missing is listed at once.
  await expect(page.locator('[data-test=hint]')).toHaveText(['• Enter the contact person', '• Contact phone: a Malaysian mobile number']);
  await expect(page.locator('[data-test=save]')).toHaveAttribute('disabled', /.*/);
  await page.locator('[data-test=contact-name] input').fill('Tan Mei Ling');
  await page.locator('[data-test=contact-phone] input').fill('12345');
  await expect(page.locator('[data-test=hint]')).toHaveText(['• Contact phone: a Malaysian mobile number']);
  await page.locator('[data-test=contact-phone] input').fill('012-345 6789');
  await expect(page.locator('[data-test=save]')).not.toHaveAttribute('disabled', /.*/);
  await page.locator('[data-test=save]').click();

  const home = page.locator('[data-test=address]', { hasText: 'Home' });
  await expect(home.locator('[data-test=address-line]')).toHaveText('A-12-3, Jalan Kiara 3, Kiara Condo, 50480 Mont Kiara');
  await expect(home).toContainText('Tan Mei Ling · +60 12-345 6789');
  await expect(home.locator('[data-test=default]')).toBeVisible();

  // A second address in PJ with an emergency contact, then make it the default.
  await page.locator('[data-test=add-address]').click();
  await fillAddress(page, { label: 'Office', area: 'Petaling Jaya', street: 'Jalan SS2/24', unit: 'No 8', postcode: '47300' });
  await page.locator('[data-test=contact-name] input').fill('Tan Mei Ling');
  await page.locator('[data-test=contact-phone] input').fill('0123456789');
  await page.locator('[data-test=emergency-name] input').fill('Lim');
  await page.locator('[data-test=emergency-phone] input').fill('011-2345 6789');
  await page.locator('[data-test=save]').click();
  const office = page.locator('[data-test=address]', { hasText: 'Office' });
  await expect(office).toContainText('Emergency: Lim · +60 11-2345 6789');
  await office.locator('[data-test=make-default]').click();
  await expect(office.locator('[data-test=default]')).toBeVisible();
  await expect(page.locator('[data-test=address]').first()).toContainText('Office');

  // Edit the home address: the form is filled in.
  await home.locator('[data-test=edit-address]').click();
  await expect(page.locator('[data-test=contact-phone] input')).toHaveValue('012-345 6789');
  await page.locator('[data-test=unit] input').fill('B-3-1');
  await page.locator('[data-test=save]').click();
  await expect(home.locator('[data-test=address-line]')).toContainText('B-3-1, Jalan Kiara 3');

  // Delete asks for a second tap; the other address becomes the default.
  await office.locator('[data-test=delete-address]').click();
  await expect(office).toBeVisible();
  await office.locator('[data-test=delete-address]').click();
  await expect(office).toHaveCount(0);
  await expect(home.locator('[data-test=default]')).toBeVisible();
});
