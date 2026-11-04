/**
 * Login by phone + SMS code (E2-1). Malaysian mobile numbers only for the KL pilot.
 */

export const AUTH_RULES = {
  codeLength: 6,
  codeValidSeconds: 5 * 60,
  resendAfterSeconds: 60,
  maxCodesPerHour: 5,
  maxWrongTries: 5,
  sessionDays: 30,
} as const;

export type Role = 'owner' | 'caregiver';
/** none → pending (applied) → approved / rejected; approved → suspended. Set by admin review (E4). */
export type CaregiverStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';
export const CAREGIVER_STATUSES: CaregiverStatus[] = ['none', 'pending', 'approved', 'rejected', 'suspended'];

export interface User {
  id: number;
  phone: string;
  caregiverStatus: CaregiverStatus;
  /** The role this login is using now. Owner by default. */
  activeRole: Role;
}

export interface CodeSent {
  phone: string;
  expiresInSec: number;
  resendInSec: number;
  /** Only with the mock SMS sender (development): the code, so testers need no phone. */
  devCode?: string;
}

export interface LoginResult {
  token: string;
  user: User;
  isNew: boolean;
  /** Only when an invite code was sent (E5-7): it counted, or the number already had an account (R24-2). */
  invite?: 'joined' | 'old_account';
}

/** What the login page tells the friend about the invite code. */
export const INVITE_RESULT_TEXT: Record<NonNullable<LoginResult['invite']>, string> = {
  joined: 'Invite code saved. You and your friend each get RM10 credit after your first booking is done.',
  old_account: 'This number already has a PawPal account, so the invite code was not used. Only new accounts can join with a code.',
};

/**
 * "012-345 6789", "60123456789", "+60 12 345 6789" → "+60123456789".
 * Returns null when it is not a Malaysian mobile number (01X + 7 or 8 digits).
 */
export function normalizeMyPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;
  else if (!digits.startsWith('60')) digits = `60${digits}`;
  return /^601\d{8,9}$/.test(digits) ? `+${digits}` : null;
}

/** "+60123456789" → "+60 12-345 6789", "+601112345678" → "+60 11-1234 5678". */
export function formatMyPhone(phone: string): string {
  const m = /^\+60(1\d)(\d{3,4})(\d{4})$/.exec(phone);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : phone;
}

/** Only pages inside the app may be returned to after login (never another site). */
export function safeRedirect(target: string | undefined | null, fallback = '/pages/index/index'): string {
  if (!target) return fallback;
  let path: string;
  try {
    path = decodeURIComponent(target);
  } catch {
    return fallback;
  }
  return /^\/pages\/[a-z0-9_-]+(\/[a-z0-9_-]+)*(\?[\w=&%.-]*)?$/i.test(path) && !path.startsWith('/pages/login/') ? path : fallback;
}
