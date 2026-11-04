import { safeRedirect, type CodeSent, type LoginResult, type Role, type User } from '@pawpal/shared';
import { api, clearToken, getToken, setToken } from './client';

export const sendCode = (phone: string) => api<CodeSent>('/auth/code', { phone });

/** `ref` is a friend's invite code (E5-7); the server uses it only for a new account. */
export async function login(phone: string, code: string, acceptTerms: boolean, ref?: string): Promise<LoginResult> {
  const result = await api<LoginResult>('/auth/login', ref ? { phone, code, acceptTerms, ref } : { phone, code, acceptTerms });
  setToken(result.token);
  return result;
}

/** The logged-in user, or null (no token, or the server says it expired). */
export async function currentUser(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    return await api<User>('/auth/me');
  } catch {
    return null;
  }
}

/** Switch this login's role; only approved caregivers may use caregiver (server checks). */
export const switchRole = (role: Role) => api<User>('/auth/role', { role });

/** Each role's home: owner → O01, caregiver → S01. */
export const roleHome = (role: Role) => (role === 'caregiver' ? '/pages/caregiver/index' : '/pages/index/index');

export async function logout(): Promise<void> {
  await api('/auth/logout', {}).catch(() => undefined);
  clearToken();
}

/** Login page URL that brings the user back to `returnTo` afterwards. */
export function loginUrl(returnTo: string): string {
  return `/pages/login/index?redirect=${encodeURIComponent(safeRedirect(returnTo))}`;
}

/** For pages that need an account: sends a guest to log in, then back here. */
export async function requireUser(returnTo: string): Promise<User | null> {
  const user = await currentUser();
  if (!user) uni.redirectTo({ url: loginUrl(returnTo) });
  return user;
}
