import { describe, expect, it } from 'vitest';
import { checkInviteCode, creditText, creditToUse, inviteLink, inviteShareText } from './referrals';

describe('invite friends (E5-7)', () => {
  it('checks an invite code typed at sign-up', () => {
    expect(checkInviteCode(' kf7q2m ')).toBe('KF7Q2M');
    expect(checkInviteCode('')).toBeNull();
    expect(checkInviteCode(undefined)).toBeNull();
    expect(() => checkInviteCode('KF7Q2')).toThrow('This invite code is not valid');
    expect(() => checkInviteCode('KF7Q20')).toThrow('This invite code is not valid'); // 0 is never used
  });

  it('link and share text', () => {
    const link = inviteLink('https://app.pawpal.my', 'KF7Q2M');
    expect(link).toBe('https://app.pawpal.my/pages/login/index?ref=KF7Q2M');
    expect(inviteShareText('KF7Q2M', link)).toBe(
      'Join me on PawPal for home pet care in KL. Sign up with my link (or code KF7Q2M) and we both get RM10 credit after your first booking: https://app.pawpal.my/pages/login/index?ref=KF7Q2M',
    );
  });

  it('credit used on O10 leaves at least RM1 to pay', () => {
    expect(creditToUse(1000, 4000)).toBe(1000);
    expect(creditToUse(5000, 4000)).toBe(3900);
    expect(creditToUse(0, 4000)).toBe(0);
    expect(creditToUse(1000, 100)).toBe(0);
    expect(creditText({ balanceSen: 0, nextExpiry: null })).toBe('No credit yet');
    expect(creditText({ balanceSen: 2000, nextExpiry: '2027-11-01' })).toMatch(/^RM20 credit · use by /);
  });
});
