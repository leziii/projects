/**
 * E13-4 (round 56): the admin money queue (A13) and one item's detail (A14).
 * An item is one refund or one order payout with every try at it. Only the bank's answer changes its state:
 * there is no way to mark it paid by hand (R56-4).
 */
import type { PaymentStatus } from './payments';

export const MONEY_RULES = {
  /** R56-4: a try still processing this long gets "Check with bank". */
  checkAfterMinutes: 30,
  /** Done items shown on "All", newest first. */
  doneShown: 50,
} as const;

/** refund = order or visit refund · fee_refund = unused waiting / overtime fee (E11-4) · payout = order payout (E13-1). */
export type MoneyKind = 'refund' | 'fee_refund' | 'payout';
export const MONEY_KIND_LABEL: Record<MoneyKind, string> = { refund: 'Refund', fee_refund: 'Fee refund', payout: 'Order payout' };

/** processing = sent, the bank has not answered · failed = the last try failed · done = the bank confirmed. */
export type MoneyState = 'processing' | 'failed' | 'done';
export const MONEY_STATE_LABEL: Record<MoneyState, string> = { processing: 'Processing', failed: 'Failed', done: 'Done' };

/** late (E14-1): processing longer than MONEY_RULES.checkAfterMinutes, the dashboard's money_late queue. */
export type MoneyTab = 'all' | 'failed' | 'processing' | 'late';
export const MONEY_TABS: MoneyTab[] = ['all', 'failed', 'processing', 'late'];
export const MONEY_TAB_LABEL: Record<MoneyTab, string> = { all: 'All', failed: 'Failed', processing: 'Processing', late: 'Over 30 min' };

/** What a payment reference says: its order, the item it belongs to and which try it is (0 = first). */
export interface MoneyRef {
  orderId: number;
  kind: MoneyKind;
  /** "payout", or the refund key: "full-12", "v0", "x1", "w5", "o5". */
  key: string;
  /** The reference shared by every try: order-12-payout, order-12-refund-v0. */
  base: string;
  attempt: number;
}

const REFUND = /^order-(\d+)-refund-([vwox]\d+|\d+)(?:-r(\d+))?$/;
const PAYOUT = /^order-(\d+)-payout(?:-r(\d+))?$/;

/** order-12-refund-v0-r2 → refund v0 of order 12, third try. Null for a reference that is not an order's money. */
export function parseMoneyRef(ref: string): MoneyRef | null {
  const p = PAYOUT.exec(ref);
  if (p) return { orderId: Number(p[1]), kind: 'payout', key: 'payout', base: `order-${p[1]}-payout`, attempt: Number(p[2] ?? 0) };
  const r = REFUND.exec(ref);
  if (!r) return null;
  const part = r[2];
  const key = /^[vwox]/.test(part) ? part : `full-${part}`;
  return { orderId: Number(r[1]), kind: /^[wo]/.test(part) ? 'fee_refund' : 'refund', key, base: `order-${r[1]}-refund-${part}`, attempt: Number(r[3] ?? 0) };
}

/** The reference of the next try: every try of an item has its own, so two admins pressing at once make the same one (paid once). */
export const nextTryRef = (base: string, tries: number) => `${base}-r${tries}`;

/** The item's state from its tries, oldest first. Any success means done, even if a later try failed. */
export function moneyState(tries: Pick<MoneyTry, 'status'>[]): MoneyState {
  if (tries.some((t) => t.status === 'succeeded')) return 'done';
  const last = tries[tries.length - 1];
  return !last || last.status === 'failed' ? 'failed' : 'processing';
}

/** One row of A13. `id` is the item's base reference. */
export interface MoneyItem {
  id: string;
  kind: MoneyKind;
  orderId: number;
  number: string;
  /** Visit index from 0, when the money is about one visit. */
  index: number | null;
  /** "Visit 1 cancelled", "Payout to Siti Aminah". */
  what: string;
  amountSen: number;
  state: MoneyState;
  tries: number;
  lastFailure: string | null;
  /** When the last try last changed (KL time). */
  updatedAt: string;
  /** R56-4: processing longer than MONEY_RULES.checkAfterMinutes. */
  late: boolean;
}

/** One try at an item. */
export interface MoneyTry {
  paymentId: number;
  ref: string;
  status: PaymentStatus;
  failureReason: string | null;
  at: string;
}

/** One line of the item's record: who did what and when (R56-2). */
export interface MoneyLogLine {
  at: string;
  who: string;
  what: string;
}

/** A14. */
export interface MoneyDetail extends MoneyItem {
  /** "Back to how the owner paid", "Automatic payout to caregiver-7". */
  how: string;
  tryList: MoneyTry[];
  log: MoneyLogLine[];
}

/** R56-1: items on a tab, failed first, then processing, then done; newest first within each. */
export function moneyTab(items: MoneyItem[], tab: MoneyTab): MoneyItem[] {
  const rank: Record<MoneyState, number> = { failed: 0, processing: 1, done: 2 };
  return items
    .filter((i) => (tab === 'late' ? canCheckBank(i) : tab === 'all' || i.state === tab))
    .sort((a, b) => rank[a.state] - rank[b.state] || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

/** R56-3: only a failed item can be sent again. */
export const canSendAgain = (i: Pick<MoneyItem, 'state'>) => i.state === 'failed';
/** R56-4: only an item processing for a long time can be checked with the bank. */
export const canCheckBank = (i: Pick<MoneyItem, 'state' | 'late'>) => i.state === 'processing' && i.late;

/** "2 tries", "1 try". */
export const tryCountText = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'}`;

/** What the admin sees for one try. */
export function tryStatusText(t: Pick<MoneyTry, 'status' | 'failureReason'>): string {
  if (t.status === 'succeeded') return 'Done';
  if (t.status === 'failed') return `Failed: ${t.failureReason ?? 'no reason given'}`;
  return t.status === 'checking' ? 'Checking with bank' : 'Processing';
}

export const MONEY_NOTE = 'Due is not landed, and settled is not paid. Sending again never pays twice. Nothing can be marked paid by hand.';
