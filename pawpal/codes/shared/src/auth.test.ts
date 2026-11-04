import { describe, expect, it } from 'vitest';
import { AUTH_RULES, formatMyPhone, normalizeMyPhone, safeRedirect } from './auth';

describe('Malaysian phone numbers', () => {
  it('accepts the usual ways people type them', () => {
    for (const input of ['012-345 6789', '0123456789', '60123456789', '+60123456789', '+60 12 345 6789', '123456789', '(012) 345-6789']) {
      expect(normalizeMyPhone(input), input).toBe('+60123456789');
    }
    expect(normalizeMyPhone('011-1234 5678')).toBe('+601112345678');
  });

  it('rejects non-mobile and foreign numbers', () => {
    for (const input of ['', '03-1234 5678', '012-345', '012-3456 78901', '+65 9123 4567', '+86 138 0013 8000', 'abc', '012345678a']) {
      expect(normalizeMyPhone(input), input).toBeNull();
    }
  });

  it('formats for display', () => {
    expect(formatMyPhone('+60123456789')).toBe('+60 12-345 6789');
    expect(formatMyPhone('+601112345678')).toBe('+60 11-1234 5678');
    expect(formatMyPhone('weird')).toBe('weird');
  });
});

describe('return after login', () => {
  it('goes back to an app page', () => {
    expect(safeRedirect('/pages/me/index')).toBe('/pages/me/index');
    expect(safeRedirect(encodeURIComponent('/pages/orders/detail?id=12'))).toBe('/pages/orders/detail?id=12');
  });

  it('never leaves the app or loops to login', () => {
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/pages/login/index', '/../etc', '%E0%A4%A']) {
      expect(safeRedirect(bad), bad).toBe('/pages/index/index');
    }
    expect(safeRedirect(undefined)).toBe('/pages/index/index');
  });
});

describe('auth rules', () => {
  it('match the plan', () => {
    expect(AUTH_RULES).toMatchObject({ codeLength: 6, codeValidSeconds: 300, resendAfterSeconds: 60, maxWrongTries: 5 });
  });
});
