import { expect, type APIRequestContext, type Browser } from '@playwright/test';
import { approvedCaregiver } from './caregiver-helpers';
import { API, adminSession, newPhone } from './helpers';

const now = new Date();
const year = now.getFullYear();
export const day = new Date(Date.now() + 8 * 3600e3 + 4 * 864e5).toISOString().slice(0, 10);

/** An owner with a cat, an address, one visit and a chosen caregiver; entry is set only when asked. `ref` signs up with a friend's invite code. */
export async function readyToPay(request: APIRequestContext, browser: Browser, withEntry: boolean, ref?: string) {
  const admin = await browser.newPage();
  const { header } = await adminSession(admin, request);
  const c = await approvedCaregiver(request, header, `Lim ${Math.floor(Math.random() * 1e5)} Mei`);
  await admin.close();

  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true, ...(ref ? { ref } : {}) } })).json();
  const headers = { authorization: `Bearer ${token}` };
  const cat = await (
    await request.post(`${API}/pets`, { headers, data: { kind: 'cat', name: 'Mimi', birth: { year: year - 3, month: 1 }, vaccinated: true, lastVaccine: { year, month: now.getMonth() + 1 }, confirmed: true, healthNote: '' } })
  ).json();
  await request.post(`${API}/addresses`, { headers, data: { label: 'Home', area: 'Bangsar', street: '12 Jalan Telawi', unit: 'A-3-1', postcode: '59100', contactName: 'Ali', contactPhone: '012-345 6789' } });
  expect((await request.post(`${API}/bookings/draft`, { headers, data: { petIds: [cat.id], visits: [{ date: day, start: 600 }] } })).ok()).toBe(true);
  expect((await request.post(`${API}/bookings/draft/caregiver`, { headers, data: { caregiverId: c.id } })).ok()).toBe(true);
  if (withEntry) expect((await request.post(`${API}/bookings/draft/entry`, { headers, data: { method: 'live_confirm' } })).ok()).toBe(true);
  return { token, cat, caregiverId: c.id as number, headers, caregiver: c };
}

const next = new Date(Date.parse(`${day}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

/** A booked order (paid and accepted) with one or two visits, more than 24 h away. */
export async function bookedOrder(request: APIRequestContext, browser: Browser, two: boolean) {
  const r = await readyToPay(request, browser, true);
  if (two) {
    expect((await request.post(`${API}/bookings/draft`, { headers: r.headers, data: { petIds: [r.cat.id], visits: [{ date: day, start: 600 }, { date: next, start: 600 }] } })).ok()).toBe(true);
    expect((await request.post(`${API}/bookings/draft/caregiver`, { headers: r.headers, data: { caregiverId: r.caregiverId } })).ok()).toBe(true);
    expect((await request.post(`${API}/bookings/draft/entry`, { headers: r.headers, data: { method: 'live_confirm' } })).ok()).toBe(true);
  }
  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
  return { r, order };
}
