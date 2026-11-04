import type { CaregiverCard } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { badges, cardRows } from './trust';

const card: CaregiverCard = {
  id: 7,
  displayName: 'Siti A.',
  initials: 'SA',
  hasPhoto: false,
  experienceYears: 3,
  areas: ['Bangsar', 'KLCC'],
  cats: true,
  dogs: true,
  maxDogSize: 'medium',
  intro: '',
  idVerified: true,
  certChecked: false,
  insurance: null,
};

describe('caregiver card (E4-6, O08)', () => {
  it('badges follow the admin ticks', () => {
    expect(badges(card).map((b) => b.label)).toEqual(['ID verified']);
    expect(badges(card)[0].info).toBe("PawPal checked this caregiver's IC and a selfie before approving them.");
    expect(badges({ idVerified: true, certChecked: true }).map((b) => b.key)).toEqual(['id', 'cert']);
    expect(badges({ idVerified: false, certChecked: false })).toEqual([]);
  });

  it('rows', () => {
    expect(cardRows(card)).toEqual([
      { label: 'Experience', value: '3 years experience' },
      { label: 'Cares for', value: 'Cats · Dogs up to Medium (10–25 kg)' },
      { label: 'Areas', value: 'Bangsar, KLCC' },
    ]);
    expect(cardRows({ ...card, cats: false, dogs: false, areas: [] }).map((r) => r.value).slice(1)).toEqual(['—', '—']);
  });
});
