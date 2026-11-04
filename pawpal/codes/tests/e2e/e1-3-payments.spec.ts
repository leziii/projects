import { expect, test, type Page } from '@playwright/test';
import { adminSession } from './helpers';

// E1-3: the mock gateway. Each outcome ends in exactly one result; repeats change nothing.
const rows = (page: Page) => page.locator('[data-test=payments] .el-table__body tr');

async function newCharge(page: Page, rm = '40'): Promise<string> {
  const before = await rows(page).first().locator('td').first().textContent().catch(() => null);
  await page.locator('input[data-test=amount]').fill(rm);
  await page.locator('[data-test=new-charge]').click();
  await expect(rows(page).first().locator('td').first()).not.toHaveText(before ?? '');
  return (await rows(page).first().locator('td').first().textContent())!.trim();
}

const actions = (page: Page, id: string) => page.locator(`[data-test=actions-${id}]`);
const status = (page: Page, id: string) => page.locator(`[data-test=status-${id}]`);
const row = (page: Page, id: string) => rows(page).filter({ has: actions(page, id) });

test.beforeEach(async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto('http://localhost:5173/');
  await page.getByRole('menuitem', { name: 'Payments (test)' }).click();
  await expect(page).toHaveURL(/\/payments$/);
});

test('success, then a duplicate webhook changes nothing', async ({ page }) => {
  const id = await newCharge(page);
  await expect(status(page, id)).toHaveText('Pending');
  await actions(page, id).getByRole('button', { name: 'Success' }).click();
  await expect(page.getByText(`Webhook applied: payment #${id} is now Succeeded`)).toBeVisible();
  await expect(status(page, id)).toHaveText('Succeeded');

  await actions(page, id).getByRole('button', { name: 'Resend webhook' }).click();
  await expect(page.getByText(`Duplicate webhook ignored: payment #${id} stays Succeeded`)).toBeVisible();
  await expect(row(page, id)).toContainText('Succeeded');
  await expect(row(page, id).locator('td').nth(5)).toHaveText('1');
});

test('failure shows the reason', async ({ page }) => {
  const id = await newCharge(page, '60');
  await actions(page, id).getByRole('button', { name: 'Fail' }).click();
  await expect(status(page, id)).toHaveText('Failed');
  await expect(row(page, id)).toContainText('Declined by bank (mock)');
  await expect(actions(page, id).getByRole('button', { name: 'Refund' })).toHaveCount(0);
});

test('unknown shows Checking until the gateway is asked', async ({ page }) => {
  const id = await newCharge(page);
  await actions(page, id).getByRole('button', { name: 'Unknown' }).click();
  await expect(status(page, id)).toHaveText('Checking');
  await actions(page, id).getByRole('button', { name: 'Query gateway' }).click();
  await expect(status(page, id)).toHaveText('Succeeded');
});

test('refund part of a paid charge; too much is refused', async ({ page }) => {
  const id = await newCharge(page);
  await actions(page, id).getByRole('button', { name: 'Success' }).click();
  await expect(status(page, id)).toHaveText('Succeeded');

  await actions(page, id).getByRole('button', { name: 'Refund' }).click();
  await page.locator('.el-message-box input').fill('10');
  await page.locator('.el-message-box').getByRole('button', { name: 'Refund' }).click();
  await expect(rows(page).first()).toContainText(`Refund of #${id}`);
  await expect(rows(page).first()).toContainText('RM10');

  await actions(page, id).getByRole('button', { name: 'Refund' }).click();
  await page.locator('.el-message-box input').fill('31');
  await page.locator('.el-message-box').getByRole('button', { name: 'Refund' }).click();
  await expect(page.getByText('Refunds cannot add up to more than the amount paid')).toBeVisible();
});
