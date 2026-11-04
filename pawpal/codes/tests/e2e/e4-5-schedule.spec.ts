import { expect, test } from '@playwright/test';
import { approvedCaregiver } from './caregiver-helpers';
import { ADMIN, adminSession, mobileSession } from './helpers';

// E4-5: caregivers set travel buffer and overtime, block time off, and see booked visits locked.
const klToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

test('settings save, blocks add and remove, a booked visit and its buffer cannot be blocked', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  await admin.setViewportSize({ width: 1280, height: 800 });
  const { header } = await adminSession(admin, request);
  const c = await approvedCaregiver(request, header, `Siti ${Math.floor(Math.random() * 1e5)} Aminah`);
  const today = klToday();
  const [d1, d2, d3] = [addDays(today, 1), addDays(today, 2), addDays(today, 3)];

  // Admin Test tools: a 45-minute visit tomorrow at 10:00 am (the card's defaults).
  await admin.goto(`${ADMIN}/test-tools`);
  await admin.locator('input[data-test=tv-phone]').fill(c.phone.typed);
  await admin.locator('[data-test=tv-add]').click();
  await expect(admin.locator('.el-message--success', { hasText: 'Test visit added' })).toBeVisible();
  await admin.close();

  await mobileSession(page, c.token, '/pages/me/index');
  await page.locator('[data-test=item-E4-5]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/schedule/);
  const day1 = page.locator(`[data-test=day-${d1}]`);
  await expect(day1.locator('[data-test=item-visit]')).toContainText('10:00 am – 10:45 am');
  await expect(day1.locator('[data-test=item-buffer]').first()).toContainText('9:30 am – 10:00 am');
  await expect(page.locator('[data-test=buffer-30]')).toHaveClass(/on/);

  // Settings save at once.
  await page.locator('[data-test=buffer-60]').click();
  await expect(day1.locator('[data-test=item-buffer]').first()).toContainText('9:00 am – 10:00 am');
  await page.locator('[data-test=overtime-15]').click();
  await expect(page.locator('[data-test=overtime-15]')).toHaveClass(/on/);
  await page.reload();
  await expect(page.locator('[data-test=buffer-60]')).toHaveClass(/on/);
  await expect(page.locator('[data-test=overtime-15]')).toHaveClass(/on/);

  // A block over the visit's buffer is refused.
  await page.locator('[data-test=kind-once]').click();
  await page.locator('[data-test=block-date]').selectOption(d1);
  await page.locator('[data-test=block-start]').selectOption('480');
  await page.locator('[data-test=block-end]').selectOption('570');
  await page.locator('[data-test=add-block]').click();
  await expect(page.locator('[data-test=error]')).toContainText('Booked visits and their travel time cannot be blocked');

  // One day, all day.
  await page.locator('[data-test=block-date]').selectOption(d2);
  await page.locator('[data-test=all-day]').click();
  await page.locator('[data-test=add-block]').click();
  const day2 = page.locator(`[data-test=day-${d2}]`);
  await expect(day2.locator('[data-test=item-off]')).toContainText('All day');
  await expect(page.locator('[data-test=error]')).toHaveCount(0);

  // Every week, evenings.
  await page.locator('[data-test=kind-weekly]').click();
  await page.locator('[data-test=block-weekday]').selectOption(String(weekday(d3)));
  await page.locator('[data-test=block-start]').selectOption('1080');
  await page.locator('[data-test=block-end]').selectOption('1320');
  await page.locator('[data-test=add-block]').click();
  await expect(page.locator(`[data-test=day-${d3}] [data-test=item-off]`)).toContainText('6:00 pm – 10:00 pm');
  await expect(page.locator(`[data-test=day-${addDays(d3, 7)}] [data-test=item-off]`)).toContainText('Not available (every');

  // Remove takes two taps.
  const remove = day2.locator('[data-test^=remove-block-]');
  await remove.click();
  await expect(remove).toHaveText('Tap again to remove');
  await remove.click();
  await expect(day2).toContainText('Free all day');
  await page.reload();
  await expect(day2).toContainText('Free all day');
  await expect(page.locator(`[data-test=day-${d3}] [data-test=item-off]`)).toBeVisible();
});
