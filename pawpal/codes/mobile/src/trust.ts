import { CERT_CHECKED_LABEL, ID_VERIFIED_LABEL, ID_VERIFIED_TEXT, experienceText, type CaregiverCard } from '@pawpal/shared';
import { abilitySummary } from './profile';

export interface Badge {
  key: 'id' | 'cert';
  label: string;
  /** Shown when tapped; empty when the badge needs no explanation. */
  info: string;
}

/** R17-2: badges only for the checks the admin ticked. */
export function badges(c: Pick<CaregiverCard, 'idVerified' | 'certChecked'>): Badge[] {
  return [
    ...(c.idVerified ? [{ key: 'id' as const, label: ID_VERIFIED_LABEL, info: ID_VERIFIED_TEXT }] : []),
    ...(c.certChecked ? [{ key: 'cert' as const, label: CERT_CHECKED_LABEL, info: 'PawPal checked the certificates this caregiver sent.' }] : []),
  ];
}

/** The O08 rows, in order. */
export function cardRows(c: CaregiverCard): { label: string; value: string }[] {
  return [
    { label: 'Experience', value: experienceText(c.experienceYears) },
    { label: 'Cares for', value: abilitySummary(c) || '—' },
    { label: 'Areas', value: c.areas.join(', ') || '—' },
  ];
}
