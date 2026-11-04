import type { Pet } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { emptyForm, formProblem, formToInput, petLink, petToForm, photoProblem, savedNote, statusView, yearOptions, type PetForm } from './pets';

const now = new Date('2026-10-28T10:00:00+08:00');
const cat: PetForm = { ...emptyForm(), kind: 'cat', name: 'Mimi', birthYear: '2023', birthMonth: '5', vaccinated: 'yes', vaccineYear: '2026', vaccineMonth: '3', confirmed: true };
const dog: PetForm = { ...cat, kind: 'dog', breedChoice: 'Corgi', weight: '12' };

describe('E3-1 pet form', () => {
  it('offers the last 31 years, newest first', () => {
    const years = yearOptions(now);
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(31);
  });

  it('turns the form into what the server takes', () => {
    expect(formToInput(cat)).toMatchObject({ kind: 'cat', birth: { year: 2023, month: 5 }, breed: null, weightKg: null, vaccinated: true, lastVaccine: { year: 2026, month: 3 } });
    expect(formToInput({ ...dog, breedChoice: 'Other', breedOther: 'Akita' })).toMatchObject({ breed: 'Akita', weightKg: 12 });
    expect(formToInput({ ...cat, vaccinated: 'no' }).lastVaccine).toBeNull();
  });

  it('save stays off until required fields are filled', () => {
    expect(formProblem(emptyForm(), now)).toBe('Choose cat or dog');
    expect(formProblem(cat, now)).toBe('');
    expect(formProblem(dog, now)).toBe('');
    expect(formProblem({ ...dog, breedChoice: '' }, now)).toBe('Dogs need a breed');
    expect(formProblem({ ...dog, breedChoice: 'Other' }, now)).toBe('Dogs need a breed');
    expect(formProblem({ ...dog, weight: '' }, now)).toBe('Dogs need a weight of 1–90 kg');
    expect(formProblem({ ...cat, vaccinated: '' }, now)).toBe('Say whether the pet is vaccinated');
    expect(formProblem({ ...cat, confirmed: false }, now)).toBe('Tick to confirm the information is true');
  });

  it('fills the form from a saved pet; owner confirms again', () => {
    const pet: Pet = { id: 1, kind: 'dog', name: 'Rex', birth: { year: 2020, month: 1 }, breed: 'Akita', weightKg: 30, vaccinated: true, lastVaccine: { year: 2026, month: 1 }, healthNote: '', status: 'approved', checkReasons: [], adminNote: null, hasVaccinePhoto: false, updatedAt: '' };
    expect(petToForm(pet)).toMatchObject({ breedChoice: 'Other', breedOther: 'Akita', weight: '30', vaccinated: 'yes', vaccineMonth: '1', confirmed: false });
    expect(petToForm({ ...pet, breed: 'Corgi' })).toMatchObject({ breedChoice: 'Corgi', breedOther: '' });
  });

  it('tells the owner when a pet goes to a check', () => {
    const base = { status: 'approved', checkReasons: [] } as unknown as Pet;
    expect(savedNote(base)).toBe('Saved');
    expect(savedNote({ ...base, status: 'pending', checkReasons: ['senior', 'health_note'] })).toBe('Saved · we will check: Senior pet, Health note to read');
  });

  it('checks the photo before uploading', () => {
    expect(photoProblem({ size: 1000, type: 'image/jpeg' })).toBe('');
    expect(photoProblem({ size: 1000, type: 'application/pdf' })).toBe('Use a JPEG, PNG or WebP photo');
    expect(photoProblem({ size: 6 * 1024 * 1024, type: 'image/png' })).toBe('Photo is too big (max 5 MB)');
  });
});

describe('E3-2 pet status page', () => {
  const base: Pet = { id: 7, kind: 'cat', name: 'Mimi', birth: { year: 2014, month: 1 }, breed: null, weightKg: null, vaccinated: true, lastVaccine: { year: 2026, month: 1 }, healthNote: '', status: 'approved', checkReasons: [], adminNote: null, hasVaccinePhoto: false, updatedAt: '' };

  it('approved pets open the form; the others their status', () => {
    expect(petLink(base)).toBe('/pages/pets/edit?id=7');
    expect(petLink({ ...base, status: 'pending' })).toBe('/pages/pets/status?id=7');
  });

  it('shows each of the 4 statuses with the right words and button', () => {
    expect(statusView(base)).toMatchObject({ help: 'All set. You can book visits for this pet.', action: 'edit' });
    expect(statusView({ ...base, status: 'pending', checkReasons: ['senior'] })).toMatchObject({ reasons: ['Senior pet'], action: 'update' });
    expect(statusView({ ...base, status: 'pending' }).help).toContain('payment waits until the check is done');
    expect(statusView({ ...base, status: 'needs_info', adminNote: 'Upload the card' })).toMatchObject({ note: 'Upload the card', noteTitle: 'What we need', action: 'update' });
    expect(statusView({ ...base, status: 'rejected', adminNote: 'Aggressive' })).toMatchObject({ note: 'Aggressive', noteTitle: 'Reason', action: 'none', help: 'This pet cannot be booked. See the reason below.' });
  });
});
