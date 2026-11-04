/**
 * Invite friends (E5-7). Settled with KF in rounds 7 and 24: RM10 credit to both once the friend's first order is settled.
 * PawPal pays the credit; the caregiver still gets 85% of the full price.
 */
import { PROMO_RULES } from './promos';
import { formatRM, RuleError } from './rules';
import { dayText } from './schedule';

export const REFERRAL_RULES = { rewardSen: 1000, creditMonths: 12, codeLength: 6 } as const;

/** No 0/O or 1/I/L, so a code read aloud or typed from a photo is not mistaken. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const normalizeInvite = (input: unknown) => (typeof input === 'string' ? input.trim().toUpperCase() : '');

/** An invite code typed at sign-up: empty means none (R24-2). */
export function checkInviteCode(input: unknown): string | null {
  const code = normalizeInvite(input);
  if (!code) return null;
  if (!new RegExp(`^[${INVITE_ALPHABET}]{${REFERRAL_RULES.codeLength}}$`).test(code)) throw new RuleError('BAD_INVITE', 'This invite code is not valid. Check it, or leave it empty');
  return code;
}

/** The link a friend opens: it lands on login with the code filled in. */
export const inviteLink = (origin: string, code: string) => `${origin}/pages/login/index?ref=${code}`;

export const inviteShareText = (code: string, link: string) =>
  `Join me on PawPal for home pet care in KL. Sign up with my link (or code ${code}) and we both get ${formatRM(REFERRAL_RULES.rewardSen)} credit after your first booking: ${link}`;

/** The owner's invite card on Me (C03). */
export interface InviteInfo {
  code: string;
  /** Friends who signed up with the code / whose first order was settled. */
  joined: number;
  rewarded: number;
  credit: CreditBalance;
}

export interface CreditBalance {
  balanceSen: number;
  /** The soonest expiry of credit still left, as a Kuala Lumpur day. */
  nextExpiry: string | null;
}

export function creditText(c: CreditBalance): string {
  if (!c.balanceSen) return 'No credit yet';
  return `${formatRM(c.balanceSen)} credit${c.nextExpiry ? ` · use by ${dayText(c.nextExpiry)}` : ''}`;
}

/** Credit used on O10 (R24-5): all that helps, but the owner still pays at least RM1. */
export function creditToUse(balanceSen: number, dueSen: number): number {
  return Math.max(0, Math.min(balanceSen, dueSen - PROMO_RULES.minPaySen));
}
