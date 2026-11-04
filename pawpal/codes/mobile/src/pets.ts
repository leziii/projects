import {
  CHECK_REASON_LABEL,
  DOG_BREEDS,
  OTHER_BREED,
  PET_RULES,
  PET_STATUS_HELP,
  checkPet,
  klYearMonth,
  type Pet,
  type PetInput,
  type YearMonth,
} from '@pawpal/shared';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const BREED_OPTIONS = [...DOG_BREEDS, OTHER_BREED];

/** What the pet form (O03) holds while the owner types. Selects give strings. */
export interface PetForm {
  kind: '' | 'cat' | 'dog';
  name: string;
  birthYear: string;
  birthMonth: string;
  breedChoice: string;
  breedOther: string;
  weight: string;
  vaccinated: '' | 'yes' | 'no';
  vaccineYear: string;
  vaccineMonth: string;
  healthNote: string;
  confirmed: boolean;
}

export const emptyForm = (): PetForm => ({
  kind: '',
  name: '',
  birthYear: '',
  birthMonth: '',
  breedChoice: '',
  breedOther: '',
  weight: '',
  vaccinated: '',
  vaccineYear: '',
  vaccineMonth: '',
  healthNote: '',
  confirmed: false,
});

/** Years to pick from, newest first. */
export function yearOptions(now: Date): number[] {
  const { year } = klYearMonth(now);
  return Array.from({ length: PET_RULES.maxAgeYears + 1 }, (_, i) => year - i);
}

const ym = (year: string, month: string): YearMonth | null => (year && month ? { year: Number(year), month: Number(month) } : null);

export function formToInput(f: PetForm): Partial<PetInput> {
  const dog = f.kind === 'dog';
  return {
    kind: f.kind || undefined,
    name: f.name,
    birth: ym(f.birthYear, f.birthMonth) ?? undefined,
    breed: dog ? (f.breedChoice === OTHER_BREED ? f.breedOther : f.breedChoice) : null,
    weightKg: dog && String(f.weight).trim() ? Number(f.weight) : null,
    vaccinated: f.vaccinated ? f.vaccinated === 'yes' : undefined,
    lastVaccine: f.vaccinated === 'yes' ? ym(f.vaccineYear, f.vaccineMonth) : null,
    healthNote: f.healthNote,
    confirmed: f.confirmed,
  };
}

export function petToForm(p: Pet): PetForm {
  const listed = p.breed !== null && (DOG_BREEDS as readonly string[]).includes(p.breed);
  return {
    kind: p.kind,
    name: p.name,
    birthYear: String(p.birth.year),
    birthMonth: String(p.birth.month),
    breedChoice: p.kind === 'dog' ? (listed ? (p.breed as string) : OTHER_BREED) : '',
    breedOther: p.kind === 'dog' && !listed ? (p.breed ?? '') : '',
    weight: p.weightKg === null ? '' : String(p.weightKg),
    vaccinated: p.vaccinated ? 'yes' : 'no',
    vaccineYear: p.lastVaccine ? String(p.lastVaccine.year) : '',
    vaccineMonth: p.lastVaccine ? String(p.lastVaccine.month) : '',
    healthNote: p.healthNote,
    // The owner confirms again on every save.
    confirmed: false,
  };
}

/** The first thing stopping a save, in the same words the server uses; '' when the form can be saved. */
export function formProblem(f: PetForm, now: Date): string {
  try {
    checkPet(formToInput(f), now);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

/** Toast after saving. */
export function savedNote(p: Pet): string {
  if (p.status !== 'pending') return 'Saved';
  return `Saved · we will check: ${p.checkReasons.map((r) => CHECK_REASON_LABEL[r]).join(', ')}`;
}

/** Problem with a chosen photo before uploading it; '' if fine. */
export function photoProblem(file: { size: number; type: string }): string {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use a JPEG, PNG or WebP photo';
  if (file.size > PET_RULES.photoMaxBytes) return 'Photo is too big (max 5 MB)';
  return '';
}

export const PET_ICON = { cat: '🐱', dog: '🐶' } as const;

/** Where a tap on the list goes: approved pets open the form, the rest open their status (O04). */
export const petLink = (p: Pick<Pet, 'id' | 'status'>) => (p.status === 'approved' ? `/pages/pets/edit?id=${p.id}` : `/pages/pets/status?id=${p.id}`);

/** The status page (O04): what to say and which button to show. */
export function statusView(p: Pet): { help: string; reasons: string[]; note: string | null; noteTitle: string; action: 'update' | 'edit' | 'none' } {
  return {
    help: PET_STATUS_HELP[p.status],
    reasons: p.status === 'pending' ? p.checkReasons.map((r) => CHECK_REASON_LABEL[r]) : [],
    note: p.adminNote,
    noteTitle: p.status === 'rejected' ? 'Reason' : 'What we need',
    action: p.status === 'rejected' ? 'none' : p.status === 'approved' ? 'edit' : 'update',
  };
}
