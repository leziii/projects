import { expect, test, type APIRequestContext } from '@playwright/test';
import { submittedApplication } from './caregiver-helpers';
import { API, MOBILE, adminSession, mobileSession } from './helpers';

// E4-3: the caregiver sees the review result and what to do next; no caregiver pages before approval.
async function decide(request: APIRequestContext, header: Record<string, string>, phoneShown: string, body: object) {
  const list = await (await request.get(`${API}/admin/caregivers`, { headers: header })).json();
  const id = list.find((r: { phone: string }) => r.phone === phoneShown).userId;
  expect((await request.post(`${API}/admin/caregivers/${id}/decision`, { headers: header, data: body })).ok()).toBe(true);
}

test('waiting: status page, Me row, and caregiver pages send you to the status', async ({ page, request }) => {
  const c = await submittedApplication(request, 'Waiting Wong');
  await mobileSession(page, c.token, '/pages/me/index');
  await expect(page.locator('[data-test=me-application-status]')).toContainText('Under review');
  await page.locator('[data-test=me-application]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
  await expect(page.locator('[data-test=app-status]')).toHaveText('Under review');
  await expect(page.locator('[data-test=status-card]')).toContainText('1–3 working days');
  await expect(page.locator('[data-test=fix]')).toHaveCount(0);

  await page.goto(`${MOBILE}/pages/caregiver/index`);
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
});

test('not approved: the reason and Fix my application; approved: next steps and switch', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  await admin.close();
  const c = await submittedApplication(request, 'Result Raj');
  await decide(request, header, c.phone.shown, { status: 'rejected', note: 'Selfie does not show the IC' });

  await mobileSession(page, c.token, '/pages/me/index');
  await expect(page.locator('[data-test=me-application-status]')).toContainText('Not approved');
  await page.locator('[data-test=me-application]').click();
  await expect(page.locator('[data-test=app-status]')).toHaveText('Not approved');
  await expect(page.locator('[data-test=admin-note]')).toHaveText('Selfie does not show the IC');
  await page.locator('[data-test=fix]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/index/);
  await page.locator('[data-test=submit]').click();
  await expect(page).toHaveURL(/\/pages\/apply\/status/);
  await expect(page.locator('[data-test=app-status]')).toHaveText('Under review');

  await decide(request, header, c.phone.shown, { status: 'approved', idChecked: true });
  await page.goto(`${MOBILE}/pages/apply/status`);
  await expect(page.locator('[data-test=app-status]')).toHaveText('You are a PawPal caregiver');
  await expect(page.locator('[data-test=next-steps]')).toContainText('Coming soon');
  await page.locator('[data-test=switch-caregiver]').click();
  await expect(page).toHaveURL(/\/pages\/caregiver\/index/);
  await page.goto(`${MOBILE}/pages/me/index`);
  await expect(page.locator('[data-test=current-role]')).toHaveText('Caregiver');
  await expect(page.locator('[data-test=me-application]')).toHaveCount(0);
});
