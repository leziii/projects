import type { Address } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { addressProblem, addressToForm, contactLine, emptyAddress } from './addresses';

const filled = { ...emptyAddress(), area: 'Bangsar', street: 'Jalan Telawi 2', unit: 'No 8', postcode: '59100', contactName: 'Tan', contactPhone: '0123456789' };

describe('E3-4 address form', () => {
  it('save stays off until address, contact and phone are filled', () => {
    expect(addressProblem(emptyAddress())).toBe('Choose an area');
    expect(addressProblem({ ...filled, postcode: '591' })).toBe('Postcode: 5 digits');
    expect(addressProblem({ ...filled, contactPhone: '' })).toBe('Contact phone: a Malaysian mobile number');
    expect(addressProblem({ ...filled, emergencyName: 'Lim' })).toBe('Emergency contact: give both name and phone, or neither');
    expect(addressProblem(filled)).toBe('');
  });

  it('fills the form from a saved address with local phone numbers', () => {
    const saved: Address = { id: 1, label: 'Home', area: 'Bangsar', street: 'Jalan Telawi 2', unit: 'No 8', postcode: '59100', contactName: 'Tan', contactPhone: '+60123456789', emergencyName: 'Lim', emergencyPhone: '+601123456789', isDefault: true, updatedAt: '' };
    expect(addressToForm(saved)).toMatchObject({ contactPhone: '012-345 6789', emergencyPhone: '011-2345 6789' });
    expect(addressToForm({ ...saved, emergencyName: null, emergencyPhone: null })).toMatchObject({ emergencyName: '', emergencyPhone: '' });
    expect(contactLine('Tan', '+60123456789')).toBe('Tan · +60 12-345 6789');
    expect(contactLine(null, null)).toBe('');
  });
});
