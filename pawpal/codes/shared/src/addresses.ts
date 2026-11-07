/**
 * Owner addresses and contacts (E3-4, O05). Settled with KF in round 11:
 * area from the shared list (also used for caregiver service areas); street, unit, postcode and contacts
 * are private and stored encrypted; entry instructions are asked per booking, not stored here.
 */
import { normalizeMyPhone } from './auth';
import { geoPointOf, type GeoPoint } from './location';
import { RuleError } from './rules';

/** Pilot areas: KL plus Petaling Jaya. Admin edits the list later (E14). */
export const AREAS = [
  'Mont Kiara',
  'Sri Hartamas',
  'Bangsar',
  'Damansara Heights',
  'KLCC',
  'Bukit Bintang',
  'Ampang',
  'Cheras',
  'Bukit Jalil',
  'Setapak',
  'Kepong',
  'Taman Tun Dr Ismail',
  'Petaling Jaya',
] as const;
export type Area = (typeof AREAS)[number];

export const ADDRESS_RULES = { maxAddresses: 5, labelMax: 20, streetMin: 5, streetMax: 120, unitMax: 30, nameMax: 40 } as const;

export interface AddressInput {
  label: string;
  area: string;
  street: string;
  unit: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
  emergencyName?: string;
  emergencyPhone?: string;
  /** R38-2: the home position, set with "Use my current location"; null clears it. */
  home?: GeoPoint | null;
}

/** Cleaned fields. Phones are +60… */
export interface AddressFields {
  label: string;
  area: Area;
  street: string;
  unit: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
  emergencyName: string | null;
  emergencyPhone: string | null;
  home: GeoPoint | null;
}

export interface Address extends AddressFields {
  id: number;
  isDefault: boolean;
  updatedAt: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Checks and cleans what the owner typed. Throws RuleError with a code the form can show. */
export function checkAddress(input: Partial<AddressInput>): AddressFields {
  const label = text(input.label) || 'Home';
  if (label.length > ADDRESS_RULES.labelMax) throw new RuleError('ADDRESS_LABEL', `Name: at most ${ADDRESS_RULES.labelMax} characters`);
  if (!AREAS.includes(input.area as Area)) throw new RuleError('ADDRESS_AREA', 'Choose an area');
  const street = text(input.street);
  if (street.length < ADDRESS_RULES.streetMin || street.length > ADDRESS_RULES.streetMax) throw new RuleError('ADDRESS_STREET', 'Enter the street address');
  const unit = text(input.unit);
  if (!unit || unit.length > ADDRESS_RULES.unitMax) throw new RuleError('ADDRESS_UNIT', 'Enter the unit or house number');
  const postcode = text(input.postcode);
  if (!/^\d{5}$/.test(postcode)) throw new RuleError('ADDRESS_POSTCODE', 'Postcode: 5 digits');
  const contactName = text(input.contactName);
  if (!contactName || contactName.length > ADDRESS_RULES.nameMax) throw new RuleError('ADDRESS_CONTACT', 'Enter the contact person');
  const contactPhone = normalizeMyPhone(text(input.contactPhone));
  if (!contactPhone) throw new RuleError('ADDRESS_PHONE', 'Contact phone: a Malaysian mobile number');

  const emergencyName = text(input.emergencyName);
  const emergencyRaw = text(input.emergencyPhone);
  if (!emergencyName !== !emergencyRaw) throw new RuleError('ADDRESS_EMERGENCY', 'Emergency contact: give both name and phone, or neither');
  if (emergencyName.length > ADDRESS_RULES.nameMax) throw new RuleError('ADDRESS_EMERGENCY', `Emergency contact name: at most ${ADDRESS_RULES.nameMax} characters`);
  const emergencyPhone = emergencyRaw ? normalizeMyPhone(emergencyRaw) : null;
  if (emergencyRaw && !emergencyPhone) throw new RuleError('ADDRESS_EMERGENCY', 'Emergency phone: a Malaysian mobile number');

  return { label, area: input.area as Area, street, unit, postcode, contactName, contactPhone, emergencyName: emergencyName || null, emergencyPhone, home: geoPointOf(input.home) };
}

/** "A-12-3, Jalan Kiara 3, 50480 Mont Kiara" — shown only inside the app, never in messages. */
export const addressLine = (a: Pick<AddressFields, 'unit' | 'street' | 'postcode' | 'area'>) => `${a.unit}, ${a.street}, ${a.postcode} ${a.area}`;

/**
 * Changing the address during a booking (E5 applies this): the chosen caregiver must still cover the new area.
 * KF R11-5.
 */
export function areaRecheck(newArea: Area, caregiverAreas: readonly Area[]): 'ok' | 'caregiver_out_of_area' {
  return caregiverAreas.includes(newArea) ? 'ok' : 'caregiver_out_of_area';
}
