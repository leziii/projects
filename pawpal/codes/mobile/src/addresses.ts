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
  };
}

/** The first thing stopping a save, in the server's words; '' when it can be saved. */
export function addressProblem(f: AddressInput): string {
  try {
    checkAddress(f);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

/** "Tan Mei Ling · +60 12-345 6789" */
export const contactLine = (name: string | null, phone: string | null) => (name && phone ? `${name} · ${formatMyPhone(phone)}` : '');
