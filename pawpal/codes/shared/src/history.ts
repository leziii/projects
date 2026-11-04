/**
 * Status history (E1-4, rule G9): every status change records who, when and why.
 */
import { RuleError } from './rules';

export type ActorType = 'system' | 'gateway' | 'owner' | 'caregiver' | 'admin';

export interface Actor {
  type: ActorType;
  /** User or admin id; empty for system and gateway. */
  id?: string;
}

export interface StatusChange {
  id: number;
  entity: string;
  entityId: number;
  fromStatus: string | null;
  toStatus: string;
  actorType: ActorType;
  actorId: string | null;
  reason: string;
  createdAt: string;
}

export const ACTOR_TYPES: ActorType[] = ['system', 'gateway', 'owner', 'caregiver', 'admin'];

/** Every change needs a reason; admin changes need one written by the admin (at least 5 characters). */
export function checkReason(actor: Actor, reason: string | undefined): string {
  const text = (reason ?? '').trim();
  if (actor.type === 'admin' && text.length < 5) throw new RuleError('REASON_REQUIRED', 'Admin changes need a reason (at least 5 characters)');
  if (!text) throw new RuleError('REASON_REQUIRED', 'Every status change needs a reason');
  if (text.length > 255) throw new RuleError('REASON_TOO_LONG', 'Reason must be at most 255 characters');
  return text;
}

/** "Admin (kf)", "Gateway", "System". */
export function actorLabel(type: ActorType, id: string | null): string {
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  return id ? `${name} (${id})` : name;
}
