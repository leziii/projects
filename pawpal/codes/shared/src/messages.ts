/**
 * Message centre (E2-3, C02). A message is only a reminder: it carries a short text and a link.
 * Opening it always shows the latest state of the linked item, never the state at send time.
 * Messages never contain an address (privacy rule); the address is shown only inside the order.
 */
import type { Role, User } from './auth';
import { checkRoleSwitch, effectiveRole } from './roles';
import { RuleError } from './rules';

export type MessageCategory = 'order' | 'refund' | 'dispute' | 'account';
export const MESSAGE_CATEGORIES: readonly MessageCategory[] = ['order', 'refund', 'dispute', 'account'];

/** What a message can point to. E9-1: "report" points to one visit's report by its run id. */
export type MessageLinkType = 'caregiver_application' | 'payment' | 'pet' | 'order' | 'request' | 'report';
export const MESSAGE_LINK_TYPES: readonly MessageLinkType[] = ['caregiver_application', 'payment', 'pet', 'order', 'request', 'report'];

export const MESSAGE_LIMITS = { titleMax: 60, bodyMax: 300, pageSize: 50 } as const;

export interface MessageLink {
  type: MessageLinkType;
  id: number;
}

export interface Message {
  id: number;
  /** The role needed to open it; null = either role. */
  role: Role | null;
  category: MessageCategory;
  title: string;
  body: string;
  link: MessageLink | null;
  createdAt: string;
  readAt: string | null;
}

export interface MessageList {
  items: Message[];
  unread: number;
}

/** The linked item as it is now. gone = the item no longer exists. */
export interface LinkState {
  type: MessageLinkType;
  id: number;
  status: string;
  summary: string;
  gone: boolean;
}

export interface OpenedMessage {
  message: Message;
  latest: LinkState | null;
}

const ADDRESS_WORDS = /\b(jalan|jln|lorong|lrg|taman|tmn|persiaran|lebuhraya|lebuh|blok|block|unit|condo|apartment|kondominium|pangsapuri)\b/i;
const POSTCODE = /\b\d{5}\b/;
const UNIT_NO = /(\bno\.?\s*\d|#\d{1,3}-\d{1,4}|\b[A-Z]-\d{1,3}-\d{1,3}\b)/i;

/** True when the text looks like it holds an address (street words, a 5-digit postcode or a unit number). */
export function containsAddress(text: string): boolean {
  return ADDRESS_WORDS.test(text) || POSTCODE.test(text) || UNIT_NO.test(text);
}

/** Checks a new message's text: required, short, and no address. */
export function checkMessageText(input: { title?: unknown; body?: unknown }): { title: string; body: string } {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || !body) throw new RuleError('MESSAGE_EMPTY', 'A message needs a title and a text');
  if (title.length > MESSAGE_LIMITS.titleMax) throw new RuleError('MESSAGE_TOO_LONG', `Title: at most ${MESSAGE_LIMITS.titleMax} characters`);
  if (body.length > MESSAGE_LIMITS.bodyMax) throw new RuleError('MESSAGE_TOO_LONG', `Text: at most ${MESSAGE_LIMITS.bodyMax} characters`);
  if (containsAddress(`${title} ${body}`)) throw new RuleError('ADDRESS_IN_MESSAGE', 'Messages must not contain an address');
  return { title, body };
}

/**
 * Can this login open the message now?
 * ok = yes · switch = switch role first (C04) · blocked = this account cannot use that role.
 */
export function openCheck(user: Pick<User, 'caregiverStatus' | 'activeRole'>, message: Pick<Message, 'role'>): 'ok' | 'switch' | 'blocked' {
  if (!message.role || effectiveRole(user) === message.role) return 'ok';
  try {
    checkRoleSwitch(user, message.role);
    return 'switch';
  } catch {
    return 'blocked';
  }
}
