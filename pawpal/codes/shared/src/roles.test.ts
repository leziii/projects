import { describe, expect, it } from 'vitest';
import type { CaregiverStatus } from './auth';
import { checkCanAccept, checkRoleSwitch, effectiveRole } from './roles';

describe('role switch (G1)', () => {
  it('anyone can be an owner', () => {
    for (const s of ['none', 'pending', 'approved', 'rejected', 'suspended'] as CaregiverStatus[]) {
      expect(() => checkRoleSwitch({ caregiverStatus: s }, 'owner')).not.toThrow();
    }
  });

  it('only approved caregivers can switch to caregiver, with a reason otherwise', () => {
    expect(() => checkRoleSwitch({ caregiverStatus: 'approved' }, 'caregiver')).not.toThrow();
    expect(() => checkRoleSwitch({ caregiverStatus: 'none' }, 'caregiver')).toThrow('Apply to become a caregiver first');
    expect(() => checkRoleSwitch({ caregiverStatus: 'pending' }, 'caregiver')).toThrow('still being reviewed');
    expect(() => checkRoleSwitch({ caregiverStatus: 'rejected' }, 'caregiver')).toThrow('was not approved');
    expect(() => checkRoleSwitch({ caregiverStatus: 'suspended' }, 'caregiver')).toThrow('suspended');
  });

  it('a caregiver who loses approval falls back to owner', () => {
    expect(effectiveRole({ caregiverStatus: 'approved', activeRole: 'caregiver' })).toBe('caregiver');
    expect(effectiveRole({ caregiverStatus: 'suspended', activeRole: 'caregiver' })).toBe('owner');
    expect(effectiveRole({ caregiverStatus: 'approved', activeRole: 'owner' })).toBe('owner');
  });
});

describe('accepting an order', () => {
  const caregiver = { id: 7, caregiverStatus: 'approved' as const, activeRole: 'caregiver' as const };

  it('approved caregiver can accept someone else’s order', () => {
    expect(() => checkCanAccept(caregiver, { ownerId: 8 })).not.toThrow();
  });

  it('nobody accepts their own order', () => {
    expect(() => checkCanAccept(caregiver, { ownerId: 7 })).toThrow('You cannot accept your own order');
  });

  it('must be in the caregiver role', () => {
    expect(() => checkCanAccept({ ...caregiver, activeRole: 'owner' }, { ownerId: 8 })).toThrow('Switch to the caregiver role');
    expect(() => checkCanAccept({ ...caregiver, caregiverStatus: 'suspended' }, { ownerId: 8 })).toThrow('Switch to the caregiver role');
  });
});
