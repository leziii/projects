import { describe, expect, it } from 'vitest';
import { QUEUE_INFO, moneyFailed, moneyLate, queueCountText, queueTone, queuesFor, waitingCase, waitingException } from './dashboard';

describe('E14-1 dashboard', () => {
  it('shows only queues of pages the admin may open (R57-3)', () => {
    expect(queuesFor(['dashboard', 'cases', 'money'])).toEqual(['cases', 'money_failed', 'money_late']);
    expect(queuesFor(['dashboard'])).toEqual([]);
    expect(QUEUE_INFO.money_failed.path).toBe('/money?tab=failed');
  });

  it('counts the same rows its list waits on (R57-2)', () => {
    expect(['sent', 'reviewing', 'decided'].map((status) => waitingCase({ status }))).toEqual([true, true, false]);
    expect(['open', 'offered', 'decided'].map((status) => waitingException({ status }))).toEqual([true, false, false]);
    expect(moneyFailed({ state: 'failed' })).toBe(true);
    expect(moneyLate({ state: 'processing', late: true })).toBe(true);
    expect(moneyLate({ state: 'processing', late: false })).toBe(false);
  });

  it('grey at 0, red for failed money (R57-4)', () => {
    expect(queueTone({ key: 'pets', count: 0 })).toBe('quiet');
    expect(queueTone({ key: 'money_failed', count: 0 })).toBe('quiet');
    expect(queueTone({ key: 'money_failed', count: 2 })).toBe('danger');
    expect(queueTone({ key: 'pets', count: 2 })).toBe('warning');
    expect(queueCountText(0)).toBe('Nothing waiting');
    expect(queueCountText(3)).toBe('3 waiting');
  });
});
