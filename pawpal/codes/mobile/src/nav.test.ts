import { describe, expect, it, vi } from 'vitest';
import { keepBackArrow, needsBackArrow } from './nav';

describe('back arrow on a first page', () => {
  it('only start pages go without one', () => {
    expect(needsBackArrow('/pages/messages/index')).toBe(true);
    expect(needsBackArrow('/pages/orders/result?id=3')).toBe(true);
    expect(needsBackArrow('/')).toBe(false);
    expect(needsBackArrow('/pages/index/index')).toBe(false);
    expect(needsBackArrow('/pages/caregiver/index')).toBe(false);
    expect(needsBackArrow('/pages/login/index?redirect=%2Fpages%2Fme%2Findex')).toBe(false);
  });

  it('reLaunch and redirectTo to other pages count as normal openings', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const h = { pushState, replaceState };
    keepBackArrow(h);
    h.replaceState({ __id__: 1, __type__: 'reLaunch' }, '', '/pages/messages/index');
    h.pushState({ __id__: 2, __type__: 'redirectTo' }, '', '/pages/index/index');
    h.pushState({ __id__: 3, __type__: 'navigateTo' }, '', '/pages/me/index');
    expect(replaceState).toHaveBeenCalledWith({ __id__: 1, __type__: 'navigateTo' }, '', '/pages/messages/index');
    expect(pushState.mock.calls.map((c) => c[0].__type__)).toEqual(['redirectTo', 'navigateTo']);
  });
});
