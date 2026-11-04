import { describe, expect, it } from 'vitest';
import { AREAS, addressLine, areaRecheck, checkAddress, type AddressInput } from './addresses';

const home: AddressInput = {
  label: '',
  area: 'Mont Kiara',
  street: ' Jalan Kiara   3 ',
  unit: 'A-12-3',
  postcode: '50480',
  contactName: 'Tan Mei Ling',
  contactPhone: '012-345 6789',
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('E3-4 addresses', () => {
  it('has the 13 pilot areas, PJ included', () => {
    expect(AREAS).toHaveLength(13);
    expect(AREAS).toContain('Petaling Jaya');
  });

  it('cleans a valid address', () => {
    expect(checkAddress(home)).toEqual({
      label: 'Home',
      area: 'Mont Kiara',
      street: 'Jalan Kiara 3',
      unit: 'A-12-3',
      postcode: '50480',
      contactName: 'Tan Mei Ling',
      contactPhone: '+60123456789',
      emergencyName: null,
      emergencyPhone: null,
    });
    expect(checkAddress({ ...home, emergencyName: 'Lim', emergencyPhone: '+60 11-2345 6789' })).toMatchObject({ emergencyName: 'Lim', emergencyPhone: '+601123456789' });
  });

  it('address, contact and phone are required', () => {
    expect(code(() => checkAddress({ ...home, area: 'Penang' }))).toBe('ADDRESS_AREA');
    expect(code(() => checkAddress({ ...home, street: 'Jln' }))).toBe('ADDRESS_STREET');
    expect(code(() => checkAddress({ ...home, unit: '' }))).toBe('ADDRESS_UNIT');
    expect(code(() => checkAddress({ ...home, postcode: '5048' }))).toBe('ADDRESS_POSTCODE');
    expect(code(() => checkAddress({ ...home, contactName: '' }))).toBe('ADDRESS_CONTACT');
    expect(code(() => checkAddress({ ...home, contactPhone: '6512345678' }))).toBe('ADDRESS_PHONE');
    expect(code(() => checkAddress({ ...home, emergencyName: 'Lim' }))).toBe('ADDRESS_EMERGENCY');
    expect(code(() => checkAddress({ ...home, emergencyName: 'Lim', emergencyPhone: '123' }))).toBe('ADDRESS_EMERGENCY');
    expect(code(() => checkAddress({ ...home, label: 'x'.repeat(21) }))).toBe('ADDRESS_LABEL');
  });

  it('formats one line and re-checks the caregiver area on change', () => {
    expect(addressLine(checkAddress(home))).toBe('A-12-3, Jalan Kiara 3, 50480 Mont Kiara');
    expect(areaRecheck('Bangsar', ['Mont Kiara', 'Bangsar'])).toBe('ok');
    expect(areaRecheck('Cheras', ['Mont Kiara', 'Bangsar'])).toBe('caregiver_out_of_area');
  });
});
