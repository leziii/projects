import { describe, expect, it } from 'vitest';
import { applyFormToInput, applyProblems, canEdit, emptyApplyForm, meApplicationRow, sentDate, statusView, toggleArea } from './apply';

const now = new Date('2026-10-29T00:00:00Z');
const full = { ...emptyApplyForm(), fullName: 'Siti', icNumber: '900101-14-5678', years: '3', cats: true, areas: ['Bangsar' as const], guideRead: true };
const photos = [{ kind: 'ic_front' as const }, { kind: 'ic_back' as const }, { kind: 'selfie' as const }];

describe('caregiver application form', () => {
  it('lists what is missing, then nothing', () => {
    expect(applyProblems(emptyApplyForm(), [], now)).toContain('Full name');
    expect(applyProblems(full, [], now)).toEqual(['IC front', 'IC back', 'Selfie holding your IC']);
    expect(applyProblems(full, photos, now)).toEqual([]);
    expect(applyProblems({ ...full, dogs: true }, photos, now)).toEqual(['Largest dog size']);
  });

  it('shows a format error first', () => {
    expect(applyProblems({ ...full, icNumber: '123' }, photos, now)).toEqual(['IC number: 12 digits, e.g. 900101-14-5678']);
    expect(applyProblems({ ...full, years: '2.5' }, photos, now)).toEqual(['Experience: whole years, 0–60']);
  });

  it('turns the form into input', () => {
    expect(applyFormToInput({ ...full, years: '', maxDogSize: 'large' })).toMatchObject({ experienceYears: null, maxDogSize: null });
    expect(applyFormToInput({ ...full, dogs: true, maxDogSize: 'large' }).maxDogSize).toBe('large');
  });

  it('areas toggle in list order; which statuses can be edited', () => {
    expect(toggleArea(['Bangsar'], 'Mont Kiara')).toEqual(['Mont Kiara', 'Bangsar']);
    expect(toggleArea(['Bangsar', 'Mont Kiara'], 'Bangsar')).toEqual(['Mont Kiara']);
    expect(canEdit({ status: 'needs_info' })).toBe(true);
    expect(canEdit({ status: 'submitted' })).toBe(false);
    expect(canEdit({ status: 'rejected' })).toBe(true);
  });
});

describe('application status page (E4-3)', () => {
  it('shows the status, reason and the main button', () => {
    expect(statusView({ status: 'submitted', adminNote: null })).toMatchObject({ title: 'Under review', action: null });
    expect(statusView({ status: 'submitted', adminNote: null }).note).toContain('1–3 working days');
    expect(statusView({ status: 'needs_info', adminNote: 'Retake the selfie' })).toMatchObject({ reason: 'Retake the selfie', action: 'fix' });
    expect(statusView({ status: 'rejected', adminNote: 'IC unclear' })).toMatchObject({ title: 'Not approved', action: 'fix' });
    expect(statusView({ status: 'approved', adminNote: null })).toMatchObject({ action: 'switch', reason: null });
  });

  it('date sent and the Me row', () => {
    expect(sentDate('2026-10-29 10:00:00.000')).toBe('29 Oct 2026');
    expect(sentDate(null)).toBe('');
    expect(meApplicationRow(null)).toBeNull();
    expect(meApplicationRow({ status: 'draft' })).toBeNull();
    expect(meApplicationRow({ status: 'approved' })).toBeNull();
    expect(meApplicationRow({ status: 'submitted' })).toBe('Under review');
    expect(meApplicationRow({ status: 'needs_info' })).toBe('Needs info');
    expect(meApplicationRow({ status: 'rejected' })).toBe('Not approved');
  });
});
