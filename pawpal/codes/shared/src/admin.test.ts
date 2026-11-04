import { describe, expect, it } from 'vitest';
import { ADMIN_PAGES, canSeePage, checkPages, checkPassword, checkUsername } from './admin';

describe('E2-4 admin accounts', () => {
  it('checks usernames', () => {
    expect(checkUsername(' KF.Lee ')).toBe('kf.lee');
    for (const bad of ['ab', 'has space', 'x'.repeat(33), 5]) expect(() => checkUsername(bad)).toThrow('Username');
  });

  it('needs a strong enough password', () => {
    expect(checkPassword('pawpal-2026!')).toBe('pawpal-2026!');
    for (const bad of ['short1', 'onlyletters-long', '12345678901', undefined]) expect(() => checkPassword(bad)).toThrow('at least 10 characters');
  });

  it('pages: known only, menu order', () => {
    expect(checkPages(['payments', 'dashboard', 'payments'])).toEqual(['dashboard', 'payments']);
    expect(() => checkPages(['money'])).toThrow('pages must be a list of');
    expect(() => checkPages('payments')).toThrow();
    expect(canSeePage({ pages: ['rules'] }, 'rules')).toBe(true);
    expect(canSeePage({ pages: ['rules'] }, 'payments')).toBe(false);
    expect(ADMIN_PAGES).toContain('test-tools');
  });
});
