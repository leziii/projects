import { expect, type APIRequestContext } from '@playwright/test';
import { API, newPhone } from './helpers';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

/** A random adult IC so runs never clash on the same-IC rule. */
export const randomIc = () => `8${Math.floor(Math.random() * 10)}0${1 + Math.floor(Math.random() * 9)}1${Math.floor(Math.random() * 10)}14${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`;

/** A new account with a complete, submitted caregiver application, made through the API. */
export async function submittedApplication(request: APIRequestContext, fullName: string, ic = randomIc()) {
  const phone = newPhone();
  const { devCode } = await (await request.post(`${API}/auth/code`, { data: { phone: phone.e164 } })).json();
  const { token } = await (await request.post(`${API}/auth/login`, { data: { phone: phone.e164, code: devCode, acceptTerms: true } })).json();
  const headers = { authorization: `Bearer ${token}` };
  const form = { fullName, icNumber: ic, experienceYears: 2, cats: true, dogs: true, maxDogSize: 'small', areas: ['Bangsar'], guideRead: true };
  expect((await request.post(`${API}/caregiver/application`, { headers, data: form })).ok()).toBe(true);
  for (const kind of ['ic_front', 'ic_back', 'selfie']) {
    const res = await request.post(`${API}/caregiver/application/files?kind=${kind}`, { headers, multipart: { photo: { name: `${kind}.jpg`, mimeType: 'image/jpeg', buffer: JPEG } } });
    expect(res.ok()).toBe(true);
  }
  expect((await request.post(`${API}/caregiver/application/submit`, { headers, data: {} })).ok()).toBe(true);
  return { phone, ic, token: token as string, headers };
}

/** A new account that applied and was approved by an admin (API only). */
export async function approvedCaregiver(request: APIRequestContext, adminHeader: Record<string, string>, fullName: string) {
  const c = await submittedApplication(request, fullName);
  const { id } = await (await request.get(`${API}/auth/me`, { headers: c.headers })).json();
  expect((await request.post(`${API}/admin/caregivers/${id}/decision`, { headers: adminHeader, data: { status: 'approved', idChecked: true } })).ok()).toBe(true);
  return { ...c, id: id as number };
}
