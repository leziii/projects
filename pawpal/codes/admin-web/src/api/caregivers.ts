import {
  APPLICATION_STATUS_LABEL,
  type AppDecision,
  type Application,
  type CaregiverProfile,
  type ChangeDecision,
  type ChangeRow,
  type ProfileChange,
  type ApplicationStatus,
  type ReviewRow,
  type SameIcAccount,
  type StatusChange,
} from '@pawpal/shared';
import { getAdminToken } from '../session';
import { ApiError, api } from './payments';

export interface ReviewDetail {
  userId: number;
  phone: string;
  application: Application;
  sameIc: SameIcAccount[];
  history: StatusChange[];
  icViews: StatusChange[];
}

export interface DecisionInput {
  status: AppDecision;
  note: string;
  idChecked: boolean;
  certChecked: boolean;
}

export const fetchReviewList = (status: ApplicationStatus, f?: typeof fetch) => api<ReviewRow[]>(`/admin/caregivers?status=${status}`, undefined, f);
export const fetchReviewDetail = (id: number, f?: typeof fetch) => api<ReviewDetail>(`/admin/caregivers/${id}`, undefined, f);
export const showFullIc = (id: number, f?: typeof fetch) => api<{ icNumber: string }>(`/admin/caregivers/${id}/ic`, {}, f);
export const decideApplication = (id: number, input: DecisionInput, f?: typeof fetch) => api<ReviewDetail>(`/admin/caregivers/${id}/decision`, input, f);

/** Document photos are private: load with the admin token and show as a local URL. */
export async function reviewFileUrl(id: number, fileId: number, f: typeof fetch = fetch): Promise<string> {
  const res = await f(`/api/admin/caregivers/${id}/files/${fileId}`, { headers: { authorization: `Bearer ${getAdminToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo');
  return URL.createObjectURL(await res.blob());
}

const label = (s: string | null) => (s ? (APPLICATION_STATUS_LABEL[s as ApplicationStatus] ?? s) : 'Created');

/** "Draft → Under review", "Under review → Needs info". */
export const appStep = (c: StatusChange) => `${label(c.fromStatus)} → ${label(c.toStatus)}`;

export const APP_DECISION_OPTIONS: { value: AppDecision; label: string }[] = [
  { value: 'approved', label: 'Approve' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'rejected', label: 'Not approved' },
];

/**
 * When Submit is allowed (KF R13-2/R13-3): Approve needs the IC tick and no approved account with the same IC;
 * Needs info / Not approved need a 5+ character reason. Returns why not, or ''.
 */
export function decisionBlock(d: Pick<DecisionInput, 'note' | 'idChecked'> & { status: AppDecision | '' }, sameIc: SameIcAccount[]): string {
  if (!d.status) return 'Choose a decision';
  if (d.status === 'approved') {
    if (sameIc.some((a) => a.status === 'approved')) return 'This IC number is already approved on another account';
    return d.idChecked ? '' : 'Tick that the IC photos and selfie match first';
  }
  return d.note.trim().length < 5 ? 'Write a reason for the caregiver (at least 5 characters)' : '';
}

export const ageOfExperience = (years: number | null) => (years === null ? '—' : `${years} year${years === 1 ? '' : 's'}`);

/* ---- Profile changes (E4-4, R15-4) ---- */

export interface ChangeDetail {
  userId: number;
  displayName: string;
  phone: string;
  current: string;
  hasCurrentPhoto: boolean;
  change: ProfileChange;
  selfieFileId: number | null;
  history: StatusChange[];
}

export const fetchChangeList = (f?: typeof fetch) => api<ChangeRow[]>('/admin/profile-changes', undefined, f);
export const fetchChangeDetail = (id: number, f?: typeof fetch) => api<ChangeDetail>(`/admin/profile-changes/${id}`, undefined, f);
export const decideChange = (id: number, status: ChangeDecision, note: string, f?: typeof fetch) =>
  api<CaregiverProfile>(`/admin/profile-changes/${id}/decision`, { status, note }, f);

export async function changePhotoUrl(id: number, which: 'pending' | 'current', f: typeof fetch = fetch): Promise<string> {
  const res = await f(`/api/admin/profile-changes/${id}/photo?which=${which}`, { headers: { authorization: `Bearer ${getAdminToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo');
  return URL.createObjectURL(await res.blob());
}

/** Not approved needs a reason the caregiver sees; Approve does not. Returns why Submit is off, or ''. */
export function changeBlock(status: ChangeDecision | '', note: string): string {
  if (!status) return 'Choose a decision';
  return status === 'rejected' && note.trim().length < 5 ? 'Write a reason for the caregiver (at least 5 characters)' : '';
}
