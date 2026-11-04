/**
 * Admin accounts (E2-4, rule G2): separate from app accounts, with their own login and per-page permissions.
 * Login = username + password + 6-digit code from an authenticator app (TOTP).
 */
import { RuleError } from './rules';

export const ADMIN_RULES = {
  maxWrongTries: 5,
  lockMinutes: 15,
  sessionHours: 12,
  passwordMin: 10,
} as const;

/** Every admin page that needs a permission. New pages are added here as they are built. */
export const ADMIN_PAGES = ['dashboard', 'caregivers', 'pets', 'rules', 'promos', 'payments', 'test-tools'] as const;
export type AdminPage = (typeof ADMIN_PAGES)[number];

export const ADMIN_PAGE_LABEL: Record<AdminPage, string> = {
  dashboard: 'Dashboard',
  caregivers: 'Caregiver review',
  pets: 'Pet check',
  rules: 'Rules',
  promos: 'Promo codes',
  payments: 'Payments (test)',
  'test-tools': 'Test tools',
};

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  pages: AdminPage[];
}

export interface AdminLoginResult {
  token: string;
  admin: AdminUser;
}

/** New admin account: the secret goes into the authenticator app once (QR or typed key). */
export interface AdminCreated {
  admin: AdminUser;
  totpSecret: string;
  otpauthUrl: string;
}

export const canSeePage = (admin: Pick<AdminUser, 'pages'>, page: AdminPage) => admin.pages.includes(page);

/** Lower-case letters, digits, dot, dash, underscore; 3–32 characters. */
export function checkUsername(input: unknown): string {
  const u = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new RuleError('BAD_USERNAME', 'Username: 3–32 letters, digits, dot, dash or underscore');
  return u;
}

/** At least 10 characters with a letter and a digit. */
export function checkPassword(input: unknown): string {
  const p = typeof input === 'string' ? input : '';
  if (p.length < ADMIN_RULES.passwordMin || !/[a-z]/i.test(p) || !/\d/.test(p)) {
    throw new RuleError('WEAK_PASSWORD', `Password: at least ${ADMIN_RULES.passwordMin} characters with a letter and a digit`);
  }
  return p;
}

/** Only known pages, no duplicates, in menu order. */
export function checkPages(input: unknown): AdminPage[] {
  if (!Array.isArray(input) || !input.every((p) => ADMIN_PAGES.includes(p))) {
    throw new RuleError('BAD_PAGES', `pages must be a list of: ${ADMIN_PAGES.join(', ')}`);
  }
  return ADMIN_PAGES.filter((p) => input.includes(p));
}
