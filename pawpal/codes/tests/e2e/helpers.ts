import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const MOBILE = 'http://localhost:5174';
export const ADMIN = 'http://localhost:5173';

/** A fresh Malaysian number each run: what you type, how the app shows it, and the +60 form. */
export function newPhone() {
  const d = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return { typed: `11-${d.slice(0, 4)} ${d.slice(4)}`, shown: `+60 11-${d.slice(0, 4)} ${d.slice(4)}`, e164: `+6011${d}` };
}

/** Logs in on the mobile app through the real login page (mock SMS code shown on screen). */
export async function loginOnMobile(page: Page, returnTo = '/pages/me/index') {
  const phone = newPhone();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${MOBILE}${returnTo}`);
  await expect(page).toHaveURL(/\/pages\/login\/index/);
  await page.locator('[data-test=phone] input').fill(phone.typed);
  await page.locator('[data-test=get-code]').click();
  const code = (/\d{6}/.exec((await page.locator('[data-test=dev-code]').textContent()) ?? '') ?? [''])[0];
  await page.locator('[data-test=code] input').fill(code);
  await page.locator('[data-test=terms]').click();
  await page.locator('[data-test=login]').click();
  await expect(page).toHaveURL(new RegExp(returnTo.replace(/[/?]/g, '\\$&')));
  return phone;
}

export const API = 'http://localhost:3000/api';
export const ADMIN_PASSWORD = 'e2e-pass-2026';

/** A fresh admin account (dev tool) with these pages, default all. */
export async function newAdmin(request: APIRequestContext, pages?: string[]) {
  const username = `e2e${Math.floor(Math.random() * 1e9)}`;
  const res = await request.post(`${API}/dev/admin`, { data: { username, name: 'E2E Admin', password: ADMIN_PASSWORD, pages } });
  expect(res.ok()).toBe(true);
  return username;
}

/** The admin's current authenticator code (dev tool; a real admin reads it from the phone app). */
export async function adminCode(request: APIRequestContext, username: string, offsetSec = 0): Promise<string> {
  return (await (await request.get(`${API}/dev/admin-code?username=${username}&offset=${offsetSec}`)).json()).code;
}

/**
 * Logs a fresh admin in through the API and gives the page its token, so admin pages open directly.
 * Returns the auth header for API calls to admin routes.
 */
export async function adminSession(page: Page, request: APIRequestContext, pages?: string[]) {
  const username = await newAdmin(request, pages);
  const res = await request.post(`${API}/admin/auth/login`, { data: { username, password: ADMIN_PASSWORD, code: await adminCode(request, username) } });
  expect(res.ok()).toBe(true);
  const { token } = await res.json();
  await page.addInitScript((t) => localStorage.setItem('pawpal.admin.token', t), token);
  return { username, header: { authorization: `Bearer ${token}` } };
}

/** Opens the mobile app already logged in with a token from the API (no second SMS code). */
export async function mobileSession(page: Page, token: string, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((t) => localStorage.setItem('pawpal.token', t), token);
  await page.goto(`${MOBILE}${path}`);
}
