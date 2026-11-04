import { APPLICATION_STATUS_LABEL, AREAS, EDITABLE, checkDraft, missingItems, type Application, type ApplicationFile, type ApplicationInput, type Area, type DogSize } from '@pawpal/shared';

/** The S02 form as typed (text fields stay strings until saved). */
export interface ApplyForm {
  fullName: string;
  icNumber: string;
  years: string;
  cats: boolean;
  dogs: boolean;
  maxDogSize: DogSize | null;
  areas: Area[];
  guideRead: boolean;
}

export const emptyApplyForm = (): ApplyForm => ({ fullName: '', icNumber: '', years: '', cats: false, dogs: false, maxDogSize: null, areas: [], guideRead: false });

export const applicationToForm = (a: Application): ApplyForm => ({
  fullName: a.fullName,
  icNumber: a.icNumber,
  years: a.experienceYears === null ? '' : String(a.experienceYears),
  cats: a.cats,
  dogs: a.dogs,
  maxDogSize: a.maxDogSize,
  areas: [...a.areas],
  guideRead: a.guideRead,
});

export const applyFormToInput = (f: ApplyForm): ApplicationInput => ({
  fullName: f.fullName,
  icNumber: f.icNumber,
  experienceYears: f.years.trim() === '' ? null : Number(f.years),
  cats: f.cats,
  dogs: f.dogs,
  maxDogSize: f.dogs ? f.maxDogSize : null,
  areas: f.areas,
  guideRead: f.guideRead,
});

/** What still blocks submit: a format error first, otherwise the missing items. Empty = ready. */
export function applyProblems(f: ApplyForm, files: Pick<ApplicationFile, 'kind'>[], now: Date): string[] {
  try {
    return missingItems(checkDraft(applyFormToInput(f), now), files);
  } catch (e) {
    return [(e as Error).message];
  }
}

/** Adds or removes an area, keeping the list in the usual order. */
export function toggleArea(areas: Area[], area: Area): Area[] {
  return areas.includes(area) ? areas.filter((a) => a !== area) : AREAS.filter((a) => a === area || areas.includes(a));
}

export const canEdit = (a: Pick<Application, 'status'>) => EDITABLE.includes(a.status);

/** The S03 status page: heading, note and the main button for each status (R14-2/R14-3). */
export function statusView(a: Pick<Application, 'status' | 'adminNote'>): { title: string; note: string; reason: string | null; action: 'fix' | 'switch' | null } {
  switch (a.status) {
    case 'submitted':
      return { title: 'Under review', note: 'We usually reply within 1–3 working days. We will message you with the result.', reason: null, action: null };
    case 'needs_info':
      return { title: 'We need more information', note: 'Fix the items below and send your application again.', reason: a.adminNote, action: 'fix' };
    case 'rejected':
      return { title: 'Not approved', note: 'You can fix your application and send it again.', reason: a.adminNote, action: 'fix' };
    case 'approved':
      return { title: 'You are a PawPal caregiver', note: 'Switch to the Caregiver role to get started.', reason: null, action: 'switch' };
    default:
      return { title: APPLICATION_STATUS_LABEL[a.status], note: '', reason: null, action: 'fix' };
  }
}

/** "2026-10-29 10:00:00.000" → "29 Oct 2026". */
export function sentDate(at: string | null): string {
  const m = at ? /^(\d{4})-(\d{2})-(\d{2})/.exec(at) : null;
  if (!m) return '';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** The Me page row (R14-5): only for people who sent an application and are not approved yet. */
export function meApplicationRow(a: Pick<Application, 'status'> | null): string | null {
  if (!a || a.status === 'draft' || a.status === 'approved') return null;
  return a.status === 'submitted' ? 'Under review' : APPLICATION_STATUS_LABEL[a.status];
}
