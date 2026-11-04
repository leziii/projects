import { expect, test } from '@playwright/test';
import { approvedCaregiver } from './caregiver-helpers';
import { API, adminSession, mobileSession, newPhone } from './helpers';

// E5-3: after choosing a caregiver, the owner says how to get in; pre-authorised needs the key or lock box.
const now = new Date();
const year = now.getFullYear();
const day = new Date(Date.now() + 8 * 3600e3 + 4 * 864e5).toISOString().slice(0, 10);

test('owner writes entry instructions; they are kept; live confirm needs none', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  const c = await approvedCaregiver(request, header, `Chong ${Math.floor(Math.random() * 1e5)} Wei`);
  await admin.close();

  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();
  const headers = { authorization: `Bearer ${token}` };
  const cat = await (
    await request.post(`${API}/pets`, { headers, data: { kind: 'cat', name: 'Mimi', birth: { year: year - 3, month: 1 }, vaccinated: true, lastVaccine: { year, month: now.getMonth() + 1 }, confirmed: true, healthNote: '' } })
  ).json();
  await request.post(`${API}/addresses`, { headers, data: { label: 'Home', area: 'Bangsar', street: '12 Jalan Telawi', unit: 'A-3-1', postcode: '59100', contactName: 'Ali', contactPhone: '012-345 6789' } });
  expect((await request.post(`${API}/bookings/draft`, { headers, data: { petIds: [cat.id], visits: [{ date: day, start: 600 }] } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/caregiver`, { headers, data: { caregiverId: c.id } })).ok()).toBe(true);

  await mobileSession(page, token, '/pages/booking/index');
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Caregiver chosen. Next: tell them how to get in.');
  await expect(page.locator('[data-test=next]')).toHaveText('Next: how to get in');
  await page.locator('[data-test=next]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/entry/);
  await expect(page.locator('[data-test=method-pre_authorised]')).toHaveClass(/on/);
  await expect(page.locator('[data-test=privacy]')).toContainText('Your caregiver sees it only after accepting');

  await page.locator('[data-test=save-entry]').click();
  await expect(page.locator('[data-test=error]')).toHaveText('Write how to get in: the door code or where the key is');
  await page.locator('[data-test=key-lock] textarea').fill('Door code 4821#');
  await page.locator('[data-test=notes] textarea').fill('Cat hides under the bed');
  await page.locator('[data-test=save-entry]').click();
  await expect(page.locator('[data-test=entry-hint]')).toHaveText('Saved. Next: check everything and pay.');

  await page.reload();
  await expect(page.locator('[data-test=key-lock] textarea')).toHaveValue('Door code 4821#');
  await expect(page.locator('[data-test=notes] textarea')).toHaveValue('Cat hides under the bed');

  await page.locator('[data-test=method-live_confirm]').click();
  await page.locator('[data-test=key-lock] textarea').fill('');
  await page.locator('[data-test=save-entry]').click();
  await expect(page.locator('[data-test=error]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-test=method-live_confirm]')).toHaveClass(/on/);
});
