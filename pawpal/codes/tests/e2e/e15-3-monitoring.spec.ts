import { expect, test } from '@playwright/test';
import { ADMIN, API, MOBILE, adminSession } from './helpers';

// E15-3 R61-2 … R61-5: health includes the gateway, the app counts funnel steps, admin sees the Funnel, test tools work.
test('the app counts opening home, and admin sees it on the Funnel page (R61-2, R61-4)', async ({ page, browser, request }) => {
  const health = await (await request.get(`${API}/health`)).json();
  expect(health).toMatchObject({ status: 'ok', database: 'up', redis: 'up', gateway: 'up' });

  const { header } = await adminSession(page, request, ['funnel']);
  const homeToday = async () => {
    const r = await (await request.get(`${API}/admin/funnel?days=7`, { headers: header })).json();
    return r.byDay[r.byDay.length - 1].counts.home as number;
  };
  const before = await homeToday();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const app = await phone.newPage();
  const sent = app.waitForResponse((r) => r.url().endsWith('/api/funnel') && r.request().method() === 'POST');
  await app.goto(`${MOBILE}/`);
  expect((await sent).status()).toBe(200);
  await phone.close();
  expect(await homeToday()).toBeGreaterThan(before);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${ADMIN}/`);
  await page.getByRole('menuitem', { name: 'Funnel' }).click();
  await expect(page).toHaveURL(/\/funnel$/);
  const steps = page.locator('[data-test=funnel-steps] .el-table__row');
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(0)).toContainText('Opened home');
  await expect(steps.nth(4)).toContainText('Paid');
  await expect(page.locator('[data-test=funnel-days-table] .el-table__row')).toHaveCount(7);
  await page.locator('[data-test=funnel-days]').getByText('Last 30 days').click();
  await expect(page.locator('[data-test=funnel-days-table] .el-table__row')).toHaveCount(30);
});

test('Test tools send a test error and a test money alert (R61-5)', async ({ page, request }) => {
  await adminSession(page, request, ['test-tools']);
  await page.goto(`${ADMIN}/test-tools`);
  await page.locator('[data-test=test-error]').click();
  await expect(page.locator('[data-test=monitor-result]')).toContainText('Server: Sentry is off (no SENTRY_DSN)');
  await expect(page.locator('[data-test=monitor-result]')).toContainText('Browser: Sentry is off (no VITE_SENTRY_DSN).');
  await page.locator('[data-test=test-alert]').click();
  await expect(page.locator('[data-test=monitor-result]')).toContainText('PawPal money alert: Payout RM1 · Test alert from Test tools');
});

test('an admin without the page cannot open the Funnel (R61-4)', async ({ page, request }) => {
  await adminSession(page, request, ['rules']);
  await page.goto(`${ADMIN}/funnel`);
  await expect(page).toHaveURL(/no-access/);
});
