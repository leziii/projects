import type { Payment } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { api, ApiError, newRef, paymentDetail, statusLabel, statusTag, webhookMessage } from './payments';

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 7,
  ref: 'r',
  kind: 'charge',
  parentId: null,
  amountSen: 4000,
  method: 'tng',
  payee: null,
  status: 'succeeded',
  gateway: 'mock',
  gatewayRef: 'mock_ch_1',
  failureReason: null,
  webhooks: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('admin payments page', () => {
  it('posts JSON and returns the body', async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await api('/payments/charges', { a: 1 }, fake)).toEqual({ id: 1 });
    expect(seen).toMatchObject({ method: 'POST', body: '{"a":1}' });
  });

  it('turns server errors into ApiError with the code', async () => {
    const fake = (async () => new Response(JSON.stringify({ code: 'REFUND_TOO_MUCH', message: 'Too much' }), { status: 400 })) as unknown as typeof fetch;
    await expect(api('/x', {}, fake)).rejects.toEqual(new ApiError('REFUND_TOO_MUCH', 'Too much'));
  });

  it('makes a new reference each time', () => {
    expect(newRef('a')).not.toBe(newRef('a'));
    expect(newRef('admin-ch')).toMatch(/^admin-ch-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('labels statuses', () => {
    expect(statusLabel('checking')).toBe('Checking');
    expect(statusTag('failed')).toBe('danger');
    expect(statusTag('succeeded')).toBe('success');
  });

  it('explains each webhook result', () => {
    expect(webhookMessage({ payment: payment(), webhook: 'applied' })).toBe('Webhook applied: payment #7 is now Succeeded');
    expect(webhookMessage({ payment: payment(), webhook: 'duplicate' })).toBe('Duplicate webhook ignored: payment #7 stays Succeeded');
    expect(webhookMessage({ payment: payment(), webhook: 'ignored' })).toBe('Late webhook ignored: payment #7 was already Succeeded');
    expect(webhookMessage({ payment: payment({ status: 'checking' }), webhook: 'none' })).toBe(
      'No webhook (result unknown): payment #7 is Checking',
    );
  });

  it('describes each kind of payment', () => {
    expect(paymentDetail(payment())).toBe("Touch 'n Go");
    expect(paymentDetail(payment({ kind: 'refund', parentId: 3, method: null }))).toBe('Refund of #3');
    expect(paymentDetail(payment({ kind: 'payout', payee: 'caregiver-1', method: null }))).toBe('To caregiver-1');
  });
});
