import { PROMO_RULES, RuleError, checkPromo, dayText, type Promo, type PromoInput, type PromoKind, type StatusChange } from '@pawpal/shared';
import { api } from './payments';

/** What the admin types on the Promo codes page; money in RM as typed (R23-6). */
export interface PromoForm {
  code: string;
  kind: PromoKind;
  amountRM: string;
  percent: string;
  maxRM: string;
  minSpendRM: string;
  startsOn: string;
  endsOn: string;
  totalUses: string;
  oncePerOwner: boolean;
  firstOrderOnly: boolean;
  reason: string;
}

export const emptyPromoForm = (today: string): PromoForm => ({
  code: '',
  kind: 'amount',
  amountRM: '',
  percent: '',
  maxRM: '',
  minSpendRM: '',
  startsOn: today,
  endsOn: '',
  totalUses: '',
  oncePerOwner: true,
  firstOrderOnly: false,
  reason: '',
});

/** "10" → 1000 sen; empty → null; anything else → NaN so the check fails. */
const sen = (rm: string): number | null => (rm.trim() === '' ? null : /^\d+(\.\d{1,2})?$/.test(rm.trim()) ? Math.round(Number(rm) * 100) : NaN);
const count = (s: string): number | null => (s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? Number(s) : NaN);

export function promoBody(f: PromoForm): Record<keyof PromoInput, unknown> & { reason: string } {
  return {
    code: f.code,
    kind: f.kind,
    amountSen: f.kind === 'amount' ? sen(f.amountRM) : null,
    percent: f.kind === 'percent' ? count(f.percent) : null,
    maxSen: f.kind === 'percent' ? sen(f.maxRM) : null,
    minSpendSen: sen(f.minSpendRM) ?? 0,
    startsOn: f.startsOn,
    endsOn: f.endsOn,
    totalUses: count(f.totalUses),
    oncePerOwner: f.oncePerOwner,
    firstOrderOnly: f.firstOrderOnly,
    reason: f.reason,
  };
}

/** Why Create is off, or '' — the same checks the server makes. */
export function promoFormBlock(f: PromoForm): string {
  try {
    checkPromo(promoBody(f));
  } catch (e) {
    if (e instanceof RuleError) return e.message;
    throw e;
  }
  if (f.reason.trim().length < PROMO_RULES.reasonMin) return `Give a reason (at least ${PROMO_RULES.reasonMin} characters)`;
  return '';
}

/** "3 / 50 used" or "3 used · no limit". */
export const usesText = (p: Pick<Promo, 'used' | 'totalUses'>) => (p.totalUses === null ? `${p.used} used · no limit` : `${p.used} / ${p.totalUses} used`);

export function limitsText(p: Pick<Promo, 'startsOn' | 'endsOn' | 'oncePerOwner' | 'firstOrderOnly'>): string {
  return [`${dayText(p.startsOn)} – ${dayText(p.endsOn)}`, p.oncePerOwner ? 'once per owner' : '', p.firstOrderOnly ? 'first order only' : ''].filter(Boolean).join(' · ');
}

export const fetchPromos = (f?: typeof fetch) => api<Promo[]>('/admin/promos', undefined, f);
export const createPromo = (form: PromoForm, f?: typeof fetch) => api<Promo>('/admin/promos', promoBody(form), f);
export const setPromoActive = (id: number, active: boolean, reason: string, f?: typeof fetch) => api<Promo>(`/admin/promos/${id}/active`, { active, reason }, f);
export const fetchPromoHistory = (id: number, f?: typeof fetch) => api<StatusChange[]>(`/admin/promos/${id}/history`, undefined, f);
