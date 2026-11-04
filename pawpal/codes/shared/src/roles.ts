/**
 * Roles (E2-2, rule G1): one account, owner by default; only approved caregivers can use the caregiver role.
 * Switching role never changes who owns an order, and nobody can accept their own order.
 */
import type { Role, User } from './auth';
import { RuleError } from './rules';

/** Can this user switch to the role? Throws a clear reason if not. */
export function checkRoleSwitch(user: Pick<User, 'caregiverStatus'>, role: Role): void {
  if (role === 'owner') return;
  const why: Record<Exclude<User['caregiverStatus'], 'approved'>, string> = {
    none: 'Apply to become a caregiver first',
    pending: 'Your caregiver application is still being reviewed',
    rejected: 'Your caregiver application was not approved',
    suspended: 'Your caregiver account is suspended',
  };
  if (user.caregiverStatus !== 'approved') throw new RuleError('ROLE_NOT_ALLOWED', why[user.caregiverStatus]);
}

/** The role a login really has: a caregiver who lost approval falls back to owner. */
export function effectiveRole(user: Pick<User, 'caregiverStatus' | 'activeRole'>): Role {
  return user.activeRole === 'caregiver' && user.caregiverStatus === 'approved' ? 'caregiver' : 'owner';
}

/** Rule for accepting an order (used in E6-2): approved caregiver, in caregiver role, not their own order. */
export function checkCanAccept(user: Pick<User, 'id' | 'caregiverStatus' | 'activeRole'>, order: { ownerId: number }): void {
  if (effectiveRole(user) !== 'caregiver') throw new RuleError('ROLE_REQUIRED', 'Switch to the caregiver role to accept orders');
  if (order.ownerId === user.id) throw new RuleError('OWN_ORDER', 'You cannot accept your own order');
}
