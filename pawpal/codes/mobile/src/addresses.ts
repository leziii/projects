import { checkAddress, formatMyPhone, type Address, type AddressInput } from '@pawpal/shared';

export const emptyAddress = (): AddressInput => ({
  label: 'Home',
  area: '',
  street: '',
  unit: '',
  postcode: '',
  contactName: '',
  contactPhone: '',
  emergencyName: '',
  emergencyPhone: '',
  home: null,
});

/** The form shows phones the way people type them (without +60). */
const local = (phone: string | null) => (phone ? formatMyPhone(phone).replace(/^\+60 /, '0') : '');

export function addressToForm(a: Address): AddressInput {
  return {
    label: a.label,
    area: a.area,
    street: a.street,
    unit: a.unit,
    postcode: a.postcode,
    contactName: a.contactName,
    contactPhone: local(a.contactPhone),
    emergencyName: a.emergencyName ?? '',
    emergencyPhone: local(a.emergencyPhone),
    home: a.home,
  };
}

/** A valid address used to check one group of fields at a time. */
const VALID: AddressInput = { ...emptyAddress(), area: 'Bangsar', street: 'Jalan Telawi 2', unit: 'No 8', postcode: '59100', contactName: 'Tan', contactPhone: '0123456789' };
/** Fields checked together, in the order they appear on the form. */
const GROUPS: (keyof AddressInput)[][] = [['label'], ['area'], ['street'], ['unit'], ['postcode'], ['contactName'], ['contactPhone'], ['emergencyName', 'emergencyPhone']];

const problemOf = (f: Partial<AddressInput>) => {
  try {
    checkAddress(f);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};

/** KF hand test (E8-6): every thing stopping a save, in form order and the server's words; [] when it can be saved. */
export function addressProblems(f: AddressInput): string[] {
  if (!problemOf(f)) return [];
  const found = GROUPS.map((keys) => problemOf({ ...VALID, ...Object.fromEntries(keys.map((k) => [k, f[k]])) })).filter(Boolean);
  return [...new Set(found)];
}

/** The first thing stopping a save; '' when it can be saved. */
export const addressProblem = (f: AddressInput): string => addressProblems(f)[0] ?? '';

/** "Tan Mei Ling · +60 12-345 6789" */
export const contactLine = (name: string | null, phone: string | null) => (name && phone ? `${name} · ${formatMyPhone(phone)}` : '');
