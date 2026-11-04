import { describe, expect, it } from 'vitest';
import { networkError } from './push';

describe('push failure reasons', () => {
  it('explains a connection that failed on every address', () => {
    const err = Object.assign(new AggregateError([Object.assign(new Error('connect ETIMEDOUT 142.250.4.95:443'), { code: 'ETIMEDOUT' })], ''), { code: 'ETIMEDOUT' });
    expect(networkError(err)).toBe('Cannot reach the push service: ETIMEDOUT · connect ETIMEDOUT 142.250.4.95:443');
    expect(networkError(new Error('getaddrinfo ENOTFOUND fcm.googleapis.com'))).toBe('Cannot reach the push service: getaddrinfo ENOTFOUND fcm.googleapis.com');
    expect(networkError({})).toBe('Cannot reach the push service');
  });
});
