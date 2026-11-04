import { expect, test } from '@playwright/test';
import { approvedCaregiver } from './caregiver-helpers';
import { API, adminSession, mobileSession, newPhone } from './helpers';

// E5-2: owners see caregivers who fit (free first), open one, and choose; clashes cannot be chosen; nobody fits keeps the draft.
const now = new Date();
const year = now.getFullYear();
const day = new Date(Date.now() + 8 * 3600e3 + 3 * 864e5).toISOString().slice(0, 10);

test('free caregiver can be chosen, a clashing one cannot; the choice clears when it stops fitting', async ({ page, browser, request }) => {
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  const free = await approvedCaregiver(request, header, `Aina ${Math.floor(Math.random() * 1e5)} Free`);
  const busy = await approvedCaregiver(request, header, `Badrul ${Math.floor(Math.random() * 1e5)} Busy`);
  await admin.close();
  expect((await request.post(`${API}/dev/test-visit`, { data: { phone: busy.phone.e164, date: day, start: 630, minutes: 60 } })).ok()).toBe(true);

  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();
  const headers = { authorization: `Bearer ${token}` };
  const vaccine = { vaccinated: true, lastVaccine: { year, month: now.getMonth() + 1 }, confirmed: true };
  const cat = await (await request.post(`${API}/pets`, { headers, data: { kind: 'cat', name: 'Mimi', birth: { year: year - 3, month: 1 }, ...vaccine, healthNote: '' } })).json();
  const dog = await (await request.post(`${API}/pets`, { headers, data: { kind: 'dog', name: 'Rex', birth: { year: year - 3, month: 1 }, breed: 'Poodle', weightKg: 8, ...vaccine, healthNote: '' } })).json();
  const home = { label: 'Home', area: 'Bangsar', street: '12 Jalan Telawi', unit: 'A-3-1', postcode: '59100', contactName: 'Ali', contactPhone: '012-345 6789' };
  await request.post(`${API}/addresses`, { headers, data: home });
  const far = await (await request.post(`${API}/addresses`, { headers, data: { ...home, label: 'Mum', area: 'Setapak' } })).json();
  await request.post(`${API}/bookings/draft`, { headers, data: { petIds: [cat.id, dog.id], overtimeUnits: 0, visits: [{ date: day, start: 600 }] } });

  await mobileSession(page, token, '/pages/booking/index');
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Ready. Choose a caregiver next.');
  await page.locator('[data-test=next]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/caregivers/);
  await expect(page.locator('[data-test=free-note]')).toHaveText('Free is not reserved. The caregiver confirms when accepting.');
  await expect(page.locator(`[data-test=option-${free.id}] [data-test=availability]`)).toHaveText('Your visit looks free');
  await expect(page.locator(`[data-test=option-${busy.id}] [data-test=availability]`)).toContainText('May clash:');
  await expect(page.locator(`[data-test=option-${busy.id}]`)).toHaveClass(/off/);

  // The clashing caregiver's card: Choose is off.
  await page.locator(`[data-test=option-${busy.id}]`).click();
  await expect(page.locator('[data-test=card-availability]')).toContainText('May clash:');
  await expect(page.locator('[data-test=choose]')).toHaveAttribute('disabled', 'true');
  await page.goBack();

  await page.locator(`[data-test=option-${free.id}]`).click();
  await expect(page.locator('[data-test=card-availability]')).toHaveText('Your visit looks free');
  await page.locator('[data-test=choose]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/index/);
  const name = await page.locator('[data-test=chosen]').textContent();
  expect(name).toMatch(/^Aina F\.$/);
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Caregiver chosen. Next: tell them how to get in.');

  // 45 min overtime is over her 30 min limit: the choice is cleared with a note.
  await page.locator('[data-test=ot-3]').click();
  await expect(page.locator('[data-test=caregiver-note]')).toHaveText('Aina F. no longer fits this booking, so the choice was cleared. Choose again.');
  await expect(page.locator('[data-test=chosen]')).toHaveCount(0);

  // An area nobody works in: nothing listed, nothing picked, the draft stays.
  await page.locator('[data-test=ot-0]').click();
  await page.locator('[data-test=address]').selectOption(String(far.id));
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Ready. Choose a caregiver next.');
  await page.locator('[data-test=next]').click();
  await expect(page.locator('[data-test=no-match]')).toBeVisible();
  await page.locator('[data-test=change-booking]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/index/);
  await expect(page.locator('[data-test=address]')).toHaveValue(String(far.id));
  await expect(page.locator('[data-test=line]')).toHaveCount(1);
});
