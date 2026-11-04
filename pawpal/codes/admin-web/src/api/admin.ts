import type { AdminLoginResult, AdminUser } from '@pawpal/shared';
import { clearAdminToken, getAdminToken, setAdminToken } from '../session';
import { api } from './payments';

let current: AdminUser | null = null;

export async function adminLogin(username: string, password: string, code: string, f?: typeof fetch): Promise<AdminUser> {
  const res = await api<AdminLoginResult>('/admin/auth/login', { username, password, code }, f);
  setAdminToken(res.token);
  current = res.admin;
  return res.admin;
}

/** The logged-in admin (asked once, then remembered), or null. */
export async function currentAdmin(f?: typeof fetch): Promise<AdminUser | null> {
  if (current) return current;
  if (!getAdminToken()) return null;
  try {
    current = await api<AdminUser>('/admin/auth/me', undefined, f);
  } catch {
    current = null;
  }
  return current;
}

export async function adminLogout(f?: typeof fetch): Promise<void> {
  await api('/admin/auth/logout', {}, f).catch(() => undefined);
  forgetAdmin();
}

export function forgetAdmin() {
  current = null;
  clearAdminToken();
}
