import { expect, test, type Page } from '@playwright/test';
import { adminSession } from './helpers';

// E1-4: every status change shows one history row with who / when / why.
const rows = (page: Page) => page.locator('[data-test=payments] .el-table__body tr');
const actions = (page: Page, id: string) => page.locator(`[data-test=actions-${id}]`);
const status = (page: Page, id: string) => page.locator(`[data-test=status-${id}]`);
const items = (page: Page) => page.locator('[data-test=history] .el-timeline-item');

async function newCharge(page: Page): Promise<string> {
  const before = await rows(page).first().locator('td').first().textContent().catch(() => null);
  await page.locator('[data-test=new-charge]').click();
  await expect(rows(page).first().locator('td').first()).not.toHaveText(before ?? '');
  return (await rows(page).first().locator('td').first().textContent())!.trim();
}

test.beforeEach(async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto('http://localhost:5173/payments');
});

test('unknown → query: three steps, each with who and why', async ({ page }) => {
  const id = await newCharge(page);
  await actions(page, id).getByRole('button', { name: 'Unknown' }).click();
  await expect(status(page, id)).toHaveText('Checking');
  await actions(page, id).getByRole('button', { name: 'Query gateway' }).click();
  await expect(status(page, id)).toHaveText('Succeeded');

  await actions(page, id).getByRole('button', { name: 'History' }).click();
  await expect(page.getByText(`History of payment #${id}`)).toBeVisible();
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).nth(0)).toContainText('Created → Pending');
  await expect(items(page).nth(0)).toContainText('System · charge created');
  await expect(items(page).nth(1)).toContainText('Pending → Checking');
  await expect(items(page).nth(1)).toContainText('Gateway · No callback from the gateway (mock: unknown)');
  await expect(items(page).nth(2)).toContainText('Checking → Succeeded');
  await expect(items(page).nth(2)).toContainText('Gateway · Result found by gateway query');
  await expect(items(page).nth(2)).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
});

test('a duplicate webhook adds no history row', async ({ page }) => {
  const id = await newCharge(page);
  await actions(page, id).getByRole('button', { name: 'Success' }).click();
  await expect(status(page, id)).toHaveText('Succeeded');
  await actions(page, id).getByRole('button', { name: 'Resend webhook' }).click();
  await expect(page.getByText(`Duplicate webhook ignored: payment #${id} stays Succeeded`)).toBeVisible();

  await actions(page, id).getByRole('button', { name: 'History' }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(1)).toContainText('Pending → Succeeded');
  await expect(items(page).nth(1)).toContainText('Gateway · Gateway webhook evt_');
});
