import { describe, expect, it } from 'vitest';
import { checkMessageText, containsAddress, openCheck } from './messages';

describe('E2-3 messages', () => {
  it('spots addresses', () => {
    for (const t of ['Visit at Jalan Ampang', 'Lrg 3, Taman Desa', '50450 Kuala Lumpur', 'Unit 12', 'Block B', 'at No. 8', '#12-03 tower', 'A-12-3 Residensi']) {
      expect(containsAddress(t), t).toBe(true);
    }
    for (const t of ['Refund RM56 is on the way', '10/28 09:00 report submitted, confirm by 21:51', 'Booking of 3 visits accepted', '1-2 pets, 3-5 days', 'RM10000 payout']) {
      expect(containsAddress(t), t).toBe(false);
    }
  });

  it('checks the text', () => {
    expect(checkMessageText({ title: ' Hi ', body: ' Your refund is on the way ' })).toEqual({ title: 'Hi', body: 'Your refund is on the way' });
    expect(() => checkMessageText({ title: '', body: 'x' })).toThrow('A message needs a title and a text');
    expect(() => checkMessageText({ title: 'x'.repeat(61), body: 'x' })).toThrow('Title: at most 60 characters');
    expect(() => checkMessageText({ title: 'x', body: 'x'.repeat(301) })).toThrow('Text: at most 300 characters');
    expect(() => checkMessageText({ title: 'Visit', body: 'Go to 12 Jalan Ampang' })).toThrow('Messages must not contain an address');
  });

  it('checks the role before opening', () => {
    const owner = { caregiverStatus: 'approved' as const, activeRole: 'owner' as const };
    expect(openCheck(owner, { role: null })).toBe('ok');
    expect(openCheck(owner, { role: 'owner' })).toBe('ok');
    expect(openCheck(owner, { role: 'caregiver' })).toBe('switch');
    expect(openCheck({ ...owner, activeRole: 'caregiver' }, { role: 'owner' })).toBe('switch');
    expect(openCheck({ ...owner, activeRole: 'caregiver' }, { role: 'caregiver' })).toBe('ok');
    expect(openCheck({ caregiverStatus: 'suspended', activeRole: 'caregiver' }, { role: 'caregiver' })).toBe('blocked');
    expect(openCheck({ caregiverStatus: 'none', activeRole: 'owner' }, { role: 'caregiver' })).toBe('blocked');
  });
});
