import { CHECK_REASON_LABEL, PET_STATUS_LABEL, type CheckReason, type Pet, type PetCheckRow, type PetDecision, type PetStatus, type StatusChange } from '@pawpal/shared';
import { getAdminToken } from '../session';
import { ApiError, api } from './payments';

export interface PetCheckDetail {
  pet: Pet;
  ownerPhone: string;
  history: StatusChange[];
}

export const fetchPetQueue = (f?: typeof fetch) => api<PetCheckRow[]>('/admin/pets', undefined, f);
export const fetchPetDetail = (id: number, f?: typeof fetch) => api<PetCheckDetail>(`/admin/pets/${id}`, undefined, f);
export const decidePet = (id: number, status: PetDecision, note: string, f?: typeof fetch) => api<Pet>(`/admin/pets/${id}/decision`, { status, note }, f);

/** The vaccine card is private: load it with the admin token and show it as a local URL. */
export async function petPhotoUrl(id: number, f: typeof fetch = fetch): Promise<string> {
  const res = await f(`/api/admin/pets/${id}/vaccine-photo`, { headers: { authorization: `Bearer ${getAdminToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo');
  return URL.createObjectURL(await res.blob());
}

export const reasonsText = (reasons: CheckReason[]) => (reasons.length ? reasons.map((r) => CHECK_REASON_LABEL[r]).join(', ') : '—');

const label = (s: string | null) => (s ? (PET_STATUS_LABEL[s as PetStatus] ?? s) : 'Created');

/** "Created → Pending check", "Pending check → Needs info". */
export const petStep = (c: StatusChange) => `${label(c.fromStatus)} → ${label(c.toStatus)}`;

export const DECISION_OPTIONS: { value: PetDecision; label: string }[] = [
  { value: 'approved', label: 'Approve' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'rejected', label: 'Not accepted' },
];

/** Reason box rules (KF R10-2): the owner sees the reason for needs info / not accepted. */
export function reasonHint(decision: PetDecision | ''): { required: boolean; placeholder: string } {
  if (decision === 'approved') return { required: false, placeholder: 'Optional internal note (the owner does not see it)' };
  return { required: true, placeholder: 'Required. The owner sees this, so write it for them' };
}
