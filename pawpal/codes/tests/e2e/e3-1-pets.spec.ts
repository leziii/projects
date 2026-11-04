import { expect, test, type Page } from '@playwright/test';
import { loginOnMobile } from './helpers';

// E3-1: owners add and edit cat and dog profiles; a dog without breed or weight cannot save.
const thisYear = new Date().getFullYear();
const thisMonth = String(new Date().getMonth() + 1);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export async function fillBasics(page: Page, kind: 'cat' | 'dog', name: string, born: number) {
  await page.locator(`[data-test=kind-${kind}]`).click();
  await page.locator('[data-test=name] input').fill(name);
  await page.locator('[data-test=birth-month]').selectOption('1');
  await page.locator('[data-test=birth-year]').selectOption(String(born));
}

export async function vaccinatedThisMonth(page: Page) {
  await page.locator('[data-test=vaccinated-yes]').click();
  await page.locator('[data-test=vaccine-month]').selectOption(thisMonth);
  await page.locator('[data-test=vaccine-year]').selectOption(String(thisYear));
}

test('owner adds a dog (breed and weight required) and a senior cat, then edits the dog', async ({ page }) => {
  await loginOnMobile(page);
  await page.locator('[data-test=item-E3-1]').click();
  await expect(page).toHaveURL(/\/pages\/pets\/index/);
  await expect(page.locator('[data-test=no-pets]')).toBeVisible();

  // Dog: save stays off until breed and weight are filled.
  await page.locator('[data-test=add-pet]').click();
  await expect(page).toHaveURL(/\/pages\/pets\/edit/);
  const save = page.locator('[data-test=save]');
  await expect(save).toHaveAttribute('disabled', /.*/);
  await fillBasics(page, 'dog', 'Lucky', thisYear - 3);
  await vaccinatedThisMonth(page);
  await page.locator('[data-test=confirm]').click();
  await expect(page.locator('[data-test=hint]')).toHaveText('Dogs need a breed');
  await expect(save).toHaveAttribute('disabled', /.*/);
  await page.locator('[data-test=breed]').selectOption('Other');
  await page.locator('[data-test=breed-other] input').fill('Akita');
  await expect(page.locator('[data-test=hint]')).toHaveText('Dogs need a weight of 1–90 kg');
  await page.locator('[data-test=weight] input').fill('95');
  await expect(page.locator('[data-test=hint]')).toHaveText('Dogs need a weight of 1–90 kg');
  await page.locator('[data-test=weight] input').fill('12.5');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test=vaccine-photo]').click()]);
  await chooser.setFiles({ name: 'card.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await expect(page.locator('[data-test=photo-preview]')).toBeVisible();
  await expect(save).not.toHaveAttribute('disabled', /.*/);
  await save.click();

  await expect(page).toHaveURL(/\/pages\/pets\/index/);
  const lucky = page.locator('[data-test=pet]', { hasText: 'Lucky' });
  await expect(lucky.locator('[data-test=pet-summary]')).toHaveText(/^Akita · 12\.5 kg · (2|3) yrs$/);
  await expect(lucky.locator('[data-test=pet-status]')).toHaveText('Approved');

  // Senior cat (12+) with a health note goes to an admin check.
  await page.locator('[data-test=add-pet]').click();
  await fillBasics(page, 'cat', 'Mimi', thisYear - 13);
  await vaccinatedThisMonth(page);
  await page.locator('[data-test=health-note] textarea').fill('Kidney diet');
  await page.locator('[data-test=confirm]').click();
  await page.locator('[data-test=save]').click();
  const mimi = page.locator('[data-test=pet]', { hasText: 'Mimi' });
  await expect(mimi.locator('[data-test=pet-status]')).toHaveText('Pending check');
  await mimi.click();
  await expect(page).toHaveURL(/\/pages\/pets\/status/);
  await expect(page.locator('[data-test=check-reasons]')).toContainText('Senior pet');
  await expect(page.locator('[data-test=check-reasons]')).toContainText('Health note to read');
  await page.goBack();

  // Edit the dog: the form is filled in, the owner confirms again, the card photo can be viewed.
  await page.locator('[data-test=pet]', { hasText: 'Lucky' }).click();
  await expect(page.locator('[data-test=name] input')).toHaveValue('Lucky');
  await expect(page.locator('[data-test=breed]')).toHaveValue('Other');
  await expect(page.locator('[data-test=breed-other] input')).toHaveValue('Akita');
  await page.locator('[data-test=view-photo]').click();
  await expect(page.locator('[data-test=photo-preview]')).toBeVisible();
  await page.locator('[data-test=weight] input').fill('13');
  await expect(page.locator('[data-test=hint]')).toHaveText('Tick to confirm the information is true');
  await page.locator('[data-test=confirm]').click();
  await page.locator('[data-test=save]').click();
  await expect(page.locator('[data-test=pet]', { hasText: 'Lucky' }).locator('[data-test=pet-summary]')).toContainText('13 kg');
});

test('a guest is sent to log in first', async ({ page }) => {
  await page.goto('http://localhost:5174/pages/pets/index');
  await expect(page).toHaveURL(/\/pages\/login\/index/);
});
