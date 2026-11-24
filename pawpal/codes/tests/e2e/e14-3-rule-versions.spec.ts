import { expect, test } from '@playwright/test';
import { ADMIN, adminSession } from './helpers';

// E14-3 R59-1 … R59-7: a change is a new version from a later date, with a reason and a from → to preview; it can be withdrawn.
test('admin saves a rule version for tomorrow, sees it waiting, then withdraws it', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${ADMIN}/rules`);
  await expect(page.locator('[data-test=rules-version]')).toContainText('In effect since');
  const waiting = page.locator('[data-test=waiting-version]');
  // Left over from an earlier run: withdraw it first.
  if (await waiting.isVisible()) {
    await page.locator('input[data-test=withdraw-reason]').fill('Clean up before the test');
    await page.locator('[data-test=withdraw]').click();
    await expect(waiting).toBeHidden();
  }

  await page.locator('[data-test=new-version]').click();
  const hint = page.locator('[data-test=version-hint]');
  await expect(hint).toHaveText('Change at least one value');
  await expect(page.locator('[data-test="group-price"]')).toContainText('Cat (RM)');
  await expect(page.locator('[data-test=edit-version]')).not.toContainText('Max pets');
  const cat = page.locator('[data-test="field-price.cat"] input');
  await cat.fill('45');
  await cat.blur();
  const split = page.locator('[data-test="field-split.caregiverServicePercent"] input');
  await split.fill('80');
  await split.blur();
  // R59-6: the preview, and a reason is needed.
  const preview = page.locator('[data-test=preview]');
  await expect(preview).toContainText('Prices · Cat: RM40 → RM45');
  await expect(preview).toContainText('Caregiver split · Service and overtime to caregiver: 85% → 80%');
  await expect(hint).toContainText('Write a reason');
  await expect(page.locator('[data-test=save-version]')).toBeDisabled();
  await page.locator('input[data-test=version-reason]').fill('December price review');
  await expect(hint).toContainText('Ready: new orders paid from');
  await page.locator('[data-test=save-version]').click();

  // R59-3, R59-5: waiting, not in effect.
  await expect(waiting).toContainText('Starts');
  await expect(waiting).toContainText('December price review');
  await expect(page.locator('[data-test=waiting-changes]')).toContainText('Prices · Cat: RM40 → RM45');
  await expect(page.locator('[data-test=prices]')).toContainText('RM40');
  await expect(page.locator('[data-test=prices]')).not.toContainText('RM45');
  const history = page.locator('[data-test=version-history]');
  await expect(history.locator('.el-table__row').first()).toContainText('Starts later');
  await expect(history).toContainText('In effect');

  // Replacing keeps one waiting version.
  await page.locator('[data-test=new-version]').click();
  await expect(page.locator('[data-test=replace-note]')).toContainText('Saving replaces the version waiting for');
  await expect(cat).toHaveValue('45.00');
  await page.locator('[data-test=cancel-edit]').click();

  // R59-5: withdraw with a reason.
  await expect(page.locator('[data-test=withdraw]')).toBeDisabled();
  await page.locator('input[data-test=withdraw-reason]').fill('Not this month');
  await page.locator('[data-test=withdraw]').click();
  await expect(waiting).toBeHidden();
  await expect(history.locator('.el-table__row').first()).toContainText('Withdrawn');
  await expect(history.locator('.el-table__row').first()).toContainText('withdrawn: Not this month');
  await expect(page.locator('[data-test=new-version]')).toHaveText('New version');
});
