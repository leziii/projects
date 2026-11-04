/**
 * Promo codes (E5-6). Settled with KF in round 23. PawPal pays the discount; the caregiver still gets 85% of the full price (R7-3).
 */
import { formatRM, RuleError } from './rules';
import { dayText } from './schedule';

export type PromoKind = 'amount' | 'percent';

/** What an admin sets (R23-1, R23-2). Money in sen; dates are Kuala Lumpur days. */
export interface PromoInput {
  code: string;
  kind: PromoKind;
  /** RM off, for kind amount. */
  amountSen: number | null;
  /** % off, for kind percent. */
  percent: number | null;
  /** Optional cap for % off. */
  maxSen: number | null;
  minSpendSen: number;
  startsOn: string;
  endsOn: string;
  /** null = no limit. */
  totalUses: number | null;
  oncePerOwner: boolean;
  firstOrderOnly: boolean;
}

export interface Promo extends PromoInput {
  id: number;
  active: boolean;
  /** Paid orders using it now (R23-4). */
  used: number;
  createdAt: string;
}

/** The owner's code on O10 and what it takes off. */
export interface AppliedPromo {
  code: string;
  discountSen: number;
  /** After the promo, before credit. */
  payTotal: number;
}

export const PROMO_RULES = { codeMin: 4, codeMax: 16, minPaySen: 100, maxAmountSen: 100_000, reasonMin: 5 } as const;

export const normalizeCode = (input: unknown) => (typeof input === 'string' ? input.trim().toUpperCase() : '');

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const whole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Checks what the admin typed (R23-6). */
export function checkPromo(input: Partial<Record<keyof PromoInput, unknown>>): PromoInput {
  const code = normalizeCode(input.code);
  const r = PROMO_RULES;
  if (!new RegExp(`^[A-Z0-9]{${r.codeMin},${r.codeMax}}$`).test(code)) throw new RuleError('PROMO_CODE', `Code: ${r.codeMin}–${r.codeMax} letters or numbers`);
  const kind = input.kind as PromoKind;
  if (kind !== 'amount' && kind !== 'percent') throw new RuleError('PROMO_KIND', 'Choose RM off or % off');
  if (kind === 'amount' && !whole(input.amountSen, 100, r.maxAmountSen)) throw new RuleError('PROMO_AMOUNT', 'RM off: from RM1 to RM1,000');
  if (kind === 'percent' && !whole(input.percent, 1, 99)) throw new RuleError('PROMO_PERCENT', '% off: from 1 to 99');
  const maxSen = kind === 'percent' && input.maxSen !== null && input.maxSen !== undefined ? input.maxSen : null;
  if (maxSen !== null && !whole(maxSen, 100, r.maxAmountSen)) throw new RuleError('PROMO_MAX', 'Maximum discount: from RM1 to RM1,000, or leave empty');
  const minSpendSen = input.minSpendSen ?? 0;
  if (!whole(minSpendSen, 0, 10_000_000)) throw new RuleError('PROMO_MIN_SPEND', 'Minimum spend must be RM0 or more');
  if (!isDate(input.startsOn) || !isDate(input.endsOn)) throw new RuleError('PROMO_DATES', 'Choose a start and an end date');
  if (input.endsOn < input.startsOn) throw new RuleError('PROMO_DATES', 'The end date must be on or after the start date');
  const totalUses = input.totalUses ?? null;
  if (totalUses !== null && !whole(totalUses, 1, 1_000_000)) throw new RuleError('PROMO_USES', 'Total uses: 1 or more, or leave empty for no limit');
  return {
    code,
    kind,
    amountSen: kind === 'amount' ? (input.amountSen as number) : null,
    percent: kind === 'percent' ? (input.percent as number) : null,
    maxSen: maxSen as number | null,
    minSpendSen: minSpendSen as number,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    totalUses: totalUses as number | null,
    oncePerOwner: input.oncePerOwner === true,
    firstOrderOnly: input.firstOrderOnly === true,
  };
}

/** What the code takes off this total; the owner always pays at least RM1 (R23-6). */
export function promoDiscount(p: Pick<PromoInput, 'kind' | 'amountSen' | 'percent' | 'maxSen'>, totalSen: number): number {
  const raw = p.kind === 'amount' ? p.amountSen! : Math.floor((totalSen * p.percent!) / 100);
  const capped = p.maxSen === null ? raw : Math.min(raw, p.maxSen);
  return Math.max(0, Math.min(capped, totalSen - PROMO_RULES.minPaySen));
}

/** Everything the server knows when a code is tried. */
export interface PromoCheck {
  today: string;
  totalSen: number;
  /** Paid or being paid now, over all owners / by this owner. */
  usedTotal: number;
  usedByOwner: number;
  /** The owner's earlier paid orders that went ahead. */
  ownerPaidOrders: number;
}

/** Why this code cannot be used now, or null (R23-2). */
export function promoProblem(p: Promo | null, c: PromoCheck): string | null {
  if (!p) return 'There is no such code';
  if (!p.active) return 'This code is turned off';
  if (c.today < p.startsOn) return `This code starts on ${dayText(p.startsOn)}`;
  if (c.today > p.endsOn) return `This code ended on ${dayText(p.endsOn)}`;
  if (p.totalUses !== null && c.usedTotal >= p.totalUses) return 'This code has been fully used';
  if (p.oncePerOwner && c.usedByOwner > 0) return 'You have already used this code';
  if (p.firstOrderOnly && c.ownerPaidOrders > 0) return 'This code is for a first order only';
  if (c.totalSen < p.minSpendSen) return `Spend at least ${formatRM(p.minSpendSen)} to use this code`;
  if (promoDiscount(p, c.totalSen) <= 0) return 'This code takes nothing off this booking';
  return null;
}

/**
 * R23-5: the discount shared across the visits by price, so refunds follow what was paid.
 * Left-over sen go to the earliest visits. Returns what was paid for each visit.
 */
export function splitDiscount(visitTotals: number[], discountSen: number): number[] {
  const total = visitTotals.reduce((s, v) => s + v, 0);
  if (!discountSen || !total) return [...visitTotals];
  const shares = visitTotals.map((v) => Math.floor((v * discountSen) / total));
  let left = discountSen - shares.reduce((s, v) => s + v, 0);
  for (let i = 0; left > 0; i = (i + 1) % shares.length, left--) shares[i]++;
  return visitTotals.map((v, i) => v - shares[i]);
}

/** "RM10 off" / "20% off, up to RM30" — the admin list and O10. */
export function promoText(p: Pick<PromoInput, 'kind' | 'amountSen' | 'percent' | 'maxSen' | 'minSpendSen'>): string {
  const off = p.kind === 'amount' ? `${formatRM(p.amountSen!)} off` : `${p.percent}% off${p.maxSen !== null ? `, up to ${formatRM(p.maxSen)}` : ''}`;
  return p.minSpendSen ? `${off} · min spend ${formatRM(p.minSpendSen)}` : off;
}
