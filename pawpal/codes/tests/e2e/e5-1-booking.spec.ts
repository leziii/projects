import { expect, test } from '@playwright/test';
import { API, MOBILE, mobileSession, newPhone } from './helpers';

// E5-1: owners set up a booking (pets, level, visits, overtime, address) and see the price per visit; the draft is kept.
const now = new Date();
const year = now.getFullYear();
const tomorrow = new Date(Date.now() + 8 * 3600e3 + 864e5).toISOString().slice(0, 10);

test('a guest is sent to log in first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${MOBILE}/pages/index/index`);
  await page.locator('[data-test=book-now]').click();
  await expect(page).toHaveURL(/\/pages\/login\/index\?redirect=.*booking/);
});

test('owner picks pets, level, visits, overtime and address; price per visit; the draft stays', async ({ page, request }) => {
  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();
  const headers = { authorization: `Bearer ${token}` };
  const vaccine = { vaccinated: true, lastVaccine: { year, month: now.getMonth() + 1 }, confirmed: true };
  const cat = await (await request.post(`${API}/pets`, { headers, data: { kind: 'cat', name: 'Mimi', birth: { year: year - 3, month: 1 }, ...vaccine, healthNote: '' } })).json();
  const dog = await (await request.post(`${API}/pets`, { headers, data: { kind: 'dog', name: 'Lucky', birth: { year: year - 3, month: 1 }, breed: 'Poodle', weightKg: 8, ...vaccine, healthNote: 'Takes medicine daily' } })).json();
  expect([cat.status, dog.status]).toEqual(['approved', 'pending']);
  const address = await (await request.post(`${API}/addresses`, { headers, data: { label: 'Home', area: 'Bangsar', street: '12 Jalan Telawi', unit: 'A-3-1', postcode: '59100', contactName: 'Ali', contactPhone: '012-345 6789' } })).json();

  await mobileSession(page, token, '/pages/index/index');
  await page.locator('[data-test=book-now]').click();
  await expect(page).toHaveURL(/\/pages\/booking\/index/);
  await expect(page.locator('[data-test=address]')).toHaveValue(String(address.id));
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Choose at least one pet');
  await expect(page.locator('[data-test=next]')).toHaveAttribute('disabled', 'true');

  // Cat only: no level choice.
  await page.locator(`[data-test=pet-${cat.id}]`).click();
  await expect(page.locator('[data-test=level-basic]')).toHaveCount(0);
  await page.locator('[data-test=visit-date]').selectOption(tomorrow);
  await page.locator('[data-test=visit-start]').selectOption('540');
  await page.locator('[data-test=add-visit]').click();
  await expect(page.locator('[data-test=line]')).toContainText('Cat RM40 = RM40 · 30 min');
  await expect(page.locator('[data-test=total]')).toHaveText('RM40');
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Ready. Choose a caregiver next.');

  // Add the dog still being checked: level appears; payment waits.
  await page.locator(`[data-test=pet-${dog.id}]`).click();
  await expect(page.locator('[data-test=level-basic]')).toHaveText('Basic · ≥45 min');
  await expect(page.locator('[data-test=line]')).toContainText('Dog + cats RM70 = RM70 · 45 min');
  await expect(page.locator('[data-test=waits]')).toContainText('Lucky: still being checked');
  await page.locator('[data-test=level-upgrade]').click();
  await page.locator('[data-test=ot-1]').click();
  await expect(page.locator('[data-test=line]')).toContainText('Dog + cats RM80 + overtime RM10 = RM90 · 75 min');

  // A second visit that overlaps is flagged; tap it to remove.
  await page.locator('[data-test=visit-start]').selectOption('570');
  await page.locator('[data-test=add-visit]').click();
  await expect(page.locator('[data-test=next-hint]')).toContainText('visits overlap');
  await page.locator(`[data-test=visit-${tomorrow}-570]`).click();
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Ready. Choose a caregiver next.');

  await page.reload();
  await expect(page.locator('[data-test=total]')).toHaveText('RM90');
  await expect(page.locator(`[data-test=pet-${dog.id}]`)).toHaveClass(/on/);
  await expect(page.locator('[data-test=level-upgrade]')).toHaveClass(/on/);

  await page.locator('[data-test=start-over]').click();
  await expect(page.locator('[data-test=next-hint]')).toHaveText('Choose at least one pet');
  await expect(page.locator('[data-test=total]')).toHaveText('RM0');
});
