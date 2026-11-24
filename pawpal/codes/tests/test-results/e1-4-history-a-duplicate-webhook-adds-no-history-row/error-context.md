# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e1-4-history.spec.ts >> a duplicate webhook adds no history row
- Location: e2e/e1-4-history.spec.ts:41:5

# Error details

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:5173/payments", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { adminSession } from './helpers';
  3  | 
  4  | // E1-4: every status change shows one history row with who / when / why.
  5  | const rows = (page: Page) => page.locator('[data-test=payments] .el-table__body tr');
  6  | const actions = (page: Page, id: string) => page.locator(`[data-test=actions-${id}]`);
  7  | const status = (page: Page, id: string) => page.locator(`[data-test=status-${id}]`);
  8  | const items = (page: Page) => page.locator('[data-test=history] .el-timeline-item');
  9  | 
  10 | async function newCharge(page: Page): Promise<string> {
  11 |   const before = await rows(page).first().locator('td').first().textContent().catch(() => null);
  12 |   await page.locator('[data-test=new-charge]').click();
  13 |   await expect(rows(page).first().locator('td').first()).not.toHaveText(before ?? '');
  14 |   return (await rows(page).first().locator('td').first().textContent())!.trim();
  15 | }
  16 | 
  17 | test.beforeEach(async ({ page, request }) => {
  18 |   await adminSession(page, request);
> 19 |   await page.goto('http://localhost:5173/payments');
     |              ^ Error: page.goto: Target page, context or browser has been closed
  20 | });
  21 | 
  22 | test('unknown → query: three steps, each with who and why', async ({ page }) => {
  23 |   const id = await newCharge(page);
  24 |   await actions(page, id).getByRole('button', { name: 'Unknown' }).click();
  25 |   await expect(status(page, id)).toHaveText('Checking');
  26 |   await actions(page, id).getByRole('button', { name: 'Query gateway' }).click();
  27 |   await expect(status(page, id)).toHaveText('Succeeded');
  28 | 
  29 |   await actions(page, id).getByRole('button', { name: 'History' }).click();
  30 |   await expect(page.getByText(`History of payment #${id}`)).toBeVisible();
  31 |   await expect(items(page)).toHaveCount(3);
  32 |   await expect(items(page).nth(0)).toContainText('Created → Pending');
  33 |   await expect(items(page).nth(0)).toContainText('System · charge created');
  34 |   await expect(items(page).nth(1)).toContainText('Pending → Checking');
  35 |   await expect(items(page).nth(1)).toContainText('Gateway · No callback from the gateway (mock: unknown)');
  36 |   await expect(items(page).nth(2)).toContainText('Checking → Succeeded');
  37 |   await expect(items(page).nth(2)).toContainText('Gateway · Result found by gateway query');
  38 |   await expect(items(page).nth(2)).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  39 | });
  40 | 
  41 | test('a duplicate webhook adds no history row', async ({ page }) => {
  42 |   const id = await newCharge(page);
  43 |   await actions(page, id).getByRole('button', { name: 'Success' }).click();
  44 |   await expect(status(page, id)).toHaveText('Succeeded');
  45 |   await actions(page, id).getByRole('button', { name: 'Resend webhook' }).click();
  46 |   await expect(page.getByText(`Duplicate webhook ignored: payment #${id} stays Succeeded`)).toBeVisible();
  47 | 
  48 |   await actions(page, id).getByRole('button', { name: 'History' }).click();
  49 |   await expect(items(page)).toHaveCount(2);
  50 |   await expect(items(page).nth(1)).toContainText('Pending → Succeeded');
  51 |   await expect(items(page).nth(1)).toContainText('Gateway · Gateway webhook evt_');
  52 | });
  53 | 
```