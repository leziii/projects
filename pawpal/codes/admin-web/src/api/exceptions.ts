import {
  CONTACT_METHOD_LABEL,
  FAULT_LABEL,
  formatRM,
  timeText,
  visitWhen,
  type AdminExceptionRow,
  type ExceptionDetail,
  type ProblemContact,
  type SubstituteCandidate,
  type SubstituteOffer,
} from '@pawpal/shared';
import { getAdminToken } from '../session';
import { ApiError, api } from './payments';

/** E12-3 A09 (R51-1): visits with a problem raised before the report. */
export const listExceptions = (f?: typeof fetch) => api<AdminExceptionRow[]>('/admin/exceptions', undefined, f);
/** A10 (R51-2): both sides' evidence. */
export const getException = (orderId: number, i: number, f?: typeof fetch) => api<ExceptionDetail>(`/admin/exceptions/${orderId}/${i}`, undefined, f);
/** A10 (R51-3): fault, refund % and a reason. */
export const decideException = (orderId: number, i: number, body: { fault: string; refundPercent: number; reason: string }, f?: typeof fetch) =>
  api<ExceptionDetail>(`/admin/exceptions/${orderId}/${i}/decide`, body, f);

/** E12-4 A10 (R52-2): caregivers free for these visits at these times. */
export const findCandidates = (orderId: number, i: number, visits: { index: number; start: number }[], f?: typeof fetch) =>
  api<SubstituteCandidate[]>(`/admin/exceptions/${orderId}/${i}/candidates?visits=${visits.map((v) => `${v.index}:${v.start}`).join(',')}`, undefined, f);
/** A10 (R52-1): send the offer to the owner. */
export const offerSubstitute = (orderId: number, i: number, body: { caregiverId: number; visits: { index: number; start: number }[]; reason: string }, f?: typeof fetch) =>
  api<SubstituteOffer>(`/admin/exceptions/${orderId}/${i}/substitute`, body, f);

/** Evidence photos are private: load them with the admin token. */
export async function exceptionPhotoUrl(kind: 'problem' | 'case', id: number, f: typeof fetch = fetch): Promise<string> {
  const res = await f(`/api/admin/exceptions/photos/${kind}/${id}`, { headers: { authorization: `Bearer ${getAdminToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo');
  return URL.createObjectURL(await res.blob());
}

export const FROM_LABEL: Record<AdminExceptionRow['from'], string> = { caregiver: 'Caregiver', owner: 'Owner', both: 'Both' };

/** A09 "Fri 20 Nov · 10:00 am · visit 1" */
export const exceptionVisitText = (r: Pick<AdminExceptionRow, 'date' | 'start' | 'index'>) => `${visitWhen(r)} · visit ${r.index + 1}`;

/** A09 status column: "To decide" / "Substitute offered" / "Substitute approved" / "Caregiver at fault". */
export function exceptionStatusText(r: Pick<AdminExceptionRow, 'status' | 'fault' | 'substitute'>): string {
  if (r.fault) return FAULT_LABEL[r.fault];
  if (r.substitute === 'approved') return 'Substitute approved';
  if (r.substitute === 'waiting') return 'Substitute offered';
  return 'To decide';
}

/** "Called · no answer · 9:51 am" */
export const contactLine = (c: ProblemContact) => [CONTACT_METHOD_LABEL[c.method], c.note, timeText(Number(c.at.slice(11, 13)) * 60 + Number(c.at.slice(14, 16)))].filter(Boolean).join(' · ');

/** A10 under the refund input: "RM40 of RM40". */
export const refundPreview = (paidSen: number, percent: number) => `${formatRM(Math.round((paidSen * percent) / 100))} of ${formatRM(paidSen)}`;
