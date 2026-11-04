import { describe, expect, it } from 'vitest';
import { ageText, ageYears, checkAdminDecision, checkPet, checkReasons, klYearMonth, petBooking, petDecisionMessage, petSummary, riskyChange, statusAfterSave, type PetInput } from './pets';

const now = new Date('2026-10-28T10:00:00+08:00');
const cat: PetInput = { kind: 'cat', name: ' Mimi ', birth: { year: 2023, month: 5 }, vaccinated: true, lastVaccine: { year: 2026, month: 3 }, confirmed: true };
const dog: PetInput = { ...cat, kind: 'dog', name: 'Lucky', breed: 'Corgi', weightKg: 12.34 };

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('E3-1 pet profile checks', () => {
  it('works out age from birth month in KL time', () => {
    expect(klYearMonth(new Date('2026-10-31T17:00:00Z'))).toEqual({ year: 2026, month: 11 });
    expect(ageYears({ year: 2023, month: 10 }, now)).toBe(3);
    expect(ageYears({ year: 2023, month: 11 }, now)).toBe(2);
    expect(ageText({ year: 2026, month: 5 }, now)).toBe('5 mths');
    expect(ageText({ year: 2025, month: 10 }, now)).toBe('1 yr');
  });

  it('cleans a valid cat and dog', () => {
    expect(checkPet(cat, now)).toEqual({ kind: 'cat', name: 'Mimi', birth: { year: 2023, month: 5 }, breed: null, weightKg: null, vaccinated: true, lastVaccine: { year: 2026, month: 3 }, healthNote: '' });
    expect(checkPet(dog, now)).toMatchObject({ breed: 'Corgi', weightKg: 12.3 });
    expect(checkPet({ ...cat, vaccinated: false }, now).lastVaccine).toBeNull();
  });

  it('a dog without breed or weight cannot save', () => {
    expect(code(() => checkPet({ ...dog, breed: '' }, now))).toBe('PET_BREED');
    expect(code(() => checkPet({ ...dog, breed: 'Other' }, now))).toBe('PET_BREED');
    expect(code(() => checkPet({ ...dog, weightKg: null }, now))).toBe('PET_WEIGHT');
    expect(code(() => checkPet({ ...dog, weightKg: 0.5 }, now))).toBe('PET_WEIGHT');
    expect(code(() => checkPet({ ...dog, weightKg: 91 }, now))).toBe('PET_WEIGHT');
  });

  it('refuses missing or wrong fields', () => {
    expect(code(() => checkPet({ ...cat, kind: 'bird' as never }, now))).toBe('PET_KIND');
    expect(code(() => checkPet({ ...cat, name: '  ' }, now))).toBe('PET_NAME');
    expect(code(() => checkPet({ ...cat, birth: { year: 2026, month: 11 } }, now))).toBe('PET_BIRTH');
    expect(code(() => checkPet({ ...cat, birth: { year: 1990, month: 1 } }, now))).toBe('PET_BIRTH');
    expect(code(() => checkPet({ ...cat, lastVaccine: null }, now))).toBe('PET_VACCINE_DATE');
    expect(code(() => checkPet({ ...cat, lastVaccine: { year: 2022, month: 1 } }, now))).toBe('PET_VACCINE_DATE');
    expect(code(() => checkPet({ ...cat, healthNote: 'x'.repeat(301) }, now))).toBe('PET_NOTE');
    expect(code(() => checkPet({ ...cat, confirmed: false }, now))).toBe('PET_NOT_CONFIRMED');
  });

  it('flags senior, no or old vaccine, and health notes for an admin check', () => {
    expect(checkReasons(checkPet(cat, now), now)).toEqual([]);
    expect(checkReasons(checkPet({ ...cat, birth: { year: 2014, month: 10 } }, now), now)).toEqual(['senior']);
    expect(checkReasons(checkPet({ ...cat, birth: { year: 2014, month: 11 } }, now), now)).toEqual([]);
    expect(checkReasons(checkPet({ ...dog, birth: { year: 2018, month: 10 } }, now), now)).toEqual(['senior']);
    expect(checkReasons(checkPet({ ...cat, vaccinated: false }, now), now)).toEqual(['no_vaccine']);
    expect(checkReasons(checkPet({ ...cat, lastVaccine: { year: 2025, month: 10 } }, now), now)).toEqual([]);
    expect(checkReasons(checkPet({ ...cat, lastVaccine: { year: 2025, month: 9 } }, now), now)).toEqual(['old_vaccine']);
    expect(checkReasons(checkPet({ ...cat, healthNote: 'Kidney diet' }, now), now)).toEqual(['health_note']);
  });

  it('nothing is rejected automatically; a rejected pet stays rejected', () => {
    expect(statusAfterSave(null, [])).toBe('approved');
    expect(statusAfterSave(null, ['senior'])).toBe('pending');
    expect(statusAfterSave('approved', ['health_note'])).toBe('pending');
    expect(statusAfterSave('rejected', [])).toBe('rejected');
    expect(statusAfterSave('needs_info', [])).toBe('pending');
  });

  it('E3-2: pending and needs-info pets may be drafted but not paid; rejected cannot be booked', () => {
    expect(petBooking('approved')).toBe('ok');
    expect(petBooking('pending')).toBe('pay_after_check');
    expect(petBooking('needs_info')).toBe('pay_after_check');
    expect(petBooking('rejected')).toBe('blocked');
  });

  it('E3-3: needs info / not accepted need a reason for the owner; approve takes an internal note', () => {
    expect(checkAdminDecision('approved', '')).toEqual({ status: 'approved', ownerNote: null, internalNote: '' });
    expect(checkAdminDecision('approved', 'Vet letter seen')).toEqual({ status: 'approved', ownerNote: null, internalNote: 'Vet letter seen' });
    expect(checkAdminDecision('needs_info', ' Upload this year\'s vaccine card ')).toMatchObject({ status: 'needs_info', ownerNote: "Upload this year's vaccine card" });
    expect(code(() => checkAdminDecision('rejected', 'no'))).toBe('PET_REASON_NEEDED');
    expect(code(() => checkAdminDecision('pending', 'x'))).toBe('PET_STATUS');
  });

  it('E3-3: an approved pet is re-checked only when a risky field changes', () => {
    const before = checkPet({ ...cat, birth: { year: 2012, month: 1 } }, now);
    expect(riskyChange(before, { ...before, name: 'New name' })).toBe(false);
    expect(riskyChange(before, { ...before, healthNote: 'Limps' })).toBe(true);
    expect(riskyChange(before, { ...before, lastVaccine: { year: 2026, month: 4 } })).toBe(true);
    expect(riskyChange(before, { ...before, birth: { year: 2012, month: 2 } })).toBe(true);
    expect(statusAfterSave('approved', ['senior'], false)).toBe('approved');
    expect(statusAfterSave('approved', ['senior'], true)).toBe('pending');
  });

  it('E3-3: the owner message names the pet and has no address', () => {
    expect(petDecisionMessage('Mimi', 'approved')).toEqual({ title: 'Mimi is approved', body: 'All set. You can book visits for this pet.' });
    expect(petDecisionMessage('Mimi', 'needs_info').title).toBe('More info needed for Mimi');
    expect(petDecisionMessage('A very very long pet name here', 'rejected').title).toBe('your pet cannot be booked');
  });

  it('summarises a pet for the list', () => {
    expect(petSummary(checkPet(dog, now), now)).toBe('Corgi · 12.3 kg · 3 yrs');
    expect(petSummary(checkPet(cat, now), now)).toBe('Cat · 3 yrs');
  });
});
