/**
 * E14-4 (round 60): the admin action log. Every admin action is one status_history row with actor "admin";
 * the log only reads them, and the database refuses to change or delete them (R60-3).
 */
import { RuleError } from './rules';

export const ACTION_LOG_RULES = { pageSize: 50 } as const;

/** The kinds of action the log can be filtered by (R60-4). */
export type ActionKind = 'caregiver' | 'pet' | 'exception' | 'case' | 'money' | 'rules' | 'promo' | 'review' | 'privacy' | 'login';
export const ACTION_KINDS: ActionKind[] = ['caregiver', 'pet', 'exception', 'case', 'money', 'rules', 'promo', 'review', 'privacy', 'login'];
export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  caregiver: 'Caregivers',
  pet: 'Pets',
  exception: 'Exceptions',
  case: 'Cases',
  money: 'Money',
  rules: 'Rules',
  promo: 'Promo codes',
  review: 'Reviews',
  privacy: 'Address and IC views',
  login: 'Logins',
};

/** History entity → kind and what to call it. */
export const ACTION_ENTITY: Record<string, { kind: ActionKind; label: string }> = {
  caregiver: { kind: 'caregiver', label: 'Caregiver' },
  caregiver_application: { kind: 'caregiver', label: 'Caregiver application' },
  caregiver_profile: { kind: 'caregiver', label: 'Profile change' },
  caregiver_ic_view: { kind: 'privacy', label: 'IC number of caregiver' },
  order_address_view: { kind: 'privacy', label: 'Address of order' },
  pet: { kind: 'pet', label: 'Pet' },
  problem: { kind: 'exception', label: 'Caregiver report' },
  visit: { kind: 'exception', label: 'Visit of order' },
  substitute: { kind: 'exception', label: 'Substitute' },
  case: { kind: 'case', label: 'Case' },
  money: { kind: 'money', label: 'Money item' },
  payment: { kind: 'money', label: 'Payment' },
  rule_version: { kind: 'rules', label: 'Rule version' },
  insurance: { kind: 'rules', label: 'Insurance note' },
  promo: { kind: 'promo', label: 'Promo code' },
  review: { kind: 'review', label: 'Review' },
  admin_login: { kind: 'login', label: 'Admin login' },
};

/** The history entities of a kind. */
export const entitiesOf = (kind: ActionKind) => Object.keys(ACTION_ENTITY).filter((e) => ACTION_ENTITY[e].kind === kind);

export interface ActionLogQuery {
  admin: string | null;
  kind: ActionKind | null;
  /** KL dates "YYYY-MM-DD", both included. */
  from: string | null;
  to: string | null;
  page: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** R60-4: reads the filters; an unknown value is refused, an empty one is no filter. */
export function checkActionQuery(input: Record<string, unknown>): ActionLogQuery {
  const text = (k: string) => (typeof input[k] === 'string' && (input[k] as string).trim() ? (input[k] as string).trim() : null);
  const kind = text('kind');
  if (kind && !ACTION_KINDS.includes(kind as ActionKind)) throw new RuleError('BAD_FILTER', 'Unknown kind of action');
  const from = text('from');
  const to = text('to');
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) throw new RuleError('BAD_FILTER', 'Dates must be YYYY-MM-DD');
  const admin = text('admin');
  if (admin && admin.length > 64) throw new RuleError('BAD_FILTER', 'Unknown admin');
  const page = Number(input.page ?? 1);
  return { admin, kind: kind as ActionKind | null, from, to, page: Number.isInteger(page) && page >= 1 ? page : 1 };
}

/** One row of the log (R60-2). */
export interface ActionLogRow {
  id: number;
  at: string;
  admin: string;
  kind: ActionKind | null;
  /** "Caregiver 12", "Rule version v15", "Money item order-12-payout". */
  what: string;
  /** "pending → approved", or just "shown" when there was no before. */
  change: string;
  reason: string;
  /** Admin page path of the item, or null. */
  link: string | null;
}

export interface ActionLogPage {
  rows: ActionLogRow[];
  total: number;
  page: number;
  /** Admins who have done anything, for the filter. */
  admins: string[];
}

export const actionChangeText = (from: string | null, to: string) => (from && from !== to ? `${from} → ${to}` : to);

/** What the row is about; `name` is the money reference or rule version when known, else the id. */
export function actionWhat(entity: string, entityId: number, name: string | null): string {
  return `${ACTION_ENTITY[entity]?.label ?? entity} ${name ?? entityId}`;
}

/** Where the row's item is in admin. `orderId` and `moneyBase` are looked up by the server. */
export function actionLink(entity: string, entityId: number, ctx: { orderId?: number | null; moneyBase?: string | null } = {}): string | null {
  switch (entity) {
    case 'caregiver':
    case 'caregiver_application':
    case 'caregiver_profile':
    case 'caregiver_ic_view':
      return `/caregivers/${entityId}`;
    case 'pet':
      return `/pets/${entityId}`;
    case 'order_address_view':
    case 'visit':
      return `/orders/${entityId}`;
    case 'problem':
    case 'substitute':
    case 'case':
      return ctx.orderId ? `/orders/${ctx.orderId}` : null;
    case 'money':
    case 'payment':
      return ctx.moneyBase ? `/money/${ctx.moneyBase}` : '/money';
    case 'rule_version':
    case 'insurance':
      return '/rules';
    case 'promo':
      return '/promos';
    case 'review':
      return '/reviews';
    default:
      return null;
  }
}

export const ACTION_LOG_NOTE = 'Every admin action, newest first. Nobody can change or delete a row.';
