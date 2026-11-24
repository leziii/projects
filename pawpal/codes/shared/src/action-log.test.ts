import { describe, expect, it } from 'vitest';
import { ACTION_ENTITY, ACTION_KINDS, actionChangeText, actionLink, actionWhat, checkActionQuery, entitiesOf } from './action-log';
import { ADMIN_PAGES, ADMIN_PAGE_LABEL } from './admin';

describe('E14-4 action log', () => {
  it('every logged entity has a kind, and each kind has entities (R60-1)', () => {
    expect(new Set(Object.values(ACTION_ENTITY).map((e) => e.kind))).toEqual(new Set(ACTION_KINDS));
    expect(entitiesOf('privacy')).toEqual(['caregiver_ic_view', 'order_address_view']);
    expect(entitiesOf('login')).toEqual(['admin_login']);
    expect(ADMIN_PAGES).toContain('actions');
    expect(ADMIN_PAGE_LABEL.actions).toBe('Action log');
  });

  it('reads filters and refuses unknown ones (R60-4)', () => {
    expect(checkActionQuery({})).toEqual({ admin: null, kind: null, from: null, to: null, page: 1 });
    expect(checkActionQuery({ admin: ' kf ', kind: 'money', from: '2026-11-01', to: '2026-11-23', page: '2' })).toEqual({ admin: 'kf', kind: 'money', from: '2026-11-01', to: '2026-11-23', page: 2 });
    expect(() => checkActionQuery({ kind: 'coffee' })).toThrow('Unknown kind of action');
    expect(() => checkActionQuery({ from: '23/11/2026' })).toThrow('YYYY-MM-DD');
    expect(checkActionQuery({ page: '-1' }).page).toBe(1);
  });

  it('says what changed and where the item is (R60-2, R60-4)', () => {
    expect(actionChangeText('pending', 'approved')).toBe('pending → approved');
    expect(actionChangeText(null, 'shown')).toBe('shown');
    expect(actionChangeText('in_service', 'in_service')).toBe('in_service');
    expect(actionWhat('rule_version', 15, 'v15')).toBe('Rule version v15');
    expect(actionWhat('caregiver', 12, null)).toBe('Caregiver 12');
    expect(actionLink('caregiver_ic_view', 12)).toBe('/caregivers/12');
    expect(actionLink('order_address_view', 40)).toBe('/orders/40');
    expect(actionLink('case', 3, { orderId: 40 })).toBe('/orders/40');
    expect(actionLink('money', 9, { moneyBase: 'order-40-payout' })).toBe('/money/order-40-payout');
    expect(actionLink('rule_version', 15)).toBe('/rules');
    expect(actionLink('admin_login', 1)).toBeNull();
  });
});
