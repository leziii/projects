import { describe, expect, it } from 'vitest';
import { caregiverOption, meMenu } from './roles';

describe('switch role page', () => {
  it('only approved caregivers can pick caregiver', () => {
    expect(caregiverOption('approved')).toEqual({ enabled: true, tag: 'Approved', apply: false });
    expect(caregiverOption('none')).toEqual({ enabled: false, tag: 'Not a caregiver yet', apply: true });
    expect(caregiverOption('pending')).toMatchObject({ enabled: false, tag: 'Under review', apply: false });
    expect(caregiverOption('rejected')).toMatchObject({ enabled: false, apply: true });
    expect(caregiverOption('suspended')).toMatchObject({ enabled: false, tag: 'Suspended', apply: false });
  });
});

describe('Me page menu', () => {
  it('owners see owner items; caregiver items only after approval', () => {
    expect(meMenu('owner', false).map((s) => s.title)).toEqual(['Owner', 'Other']);
    expect(meMenu('owner', true).map((s) => s.title)).toEqual(['Owner', 'Caregiver', 'Other']);
  });

  it('caregiver role shows caregiver items first', () => {
    expect(meMenu('caregiver', true).map((s) => s.title)).toEqual(['Caregiver', 'Owner', 'Other']);
  });

  it('built items open their page (E7-1 My orders first, E3-1 My pets)', () => {
    expect(meMenu('owner', false)[0].items[0]).toEqual({ label: 'My orders', story: 'E7-1', url: '/pages/orders/index' });
    expect(meMenu('owner', false)[0].items[1]).toEqual({ label: 'My pets', story: 'E3-1', url: '/pages/pets/index' });
  });
});
