import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureError, flushSentry, initSentry, sentryEnabled } from './sentry';

/** A stand-in for Sentry: keeps what the SDK sends. */
describe('E15-3 error tracking (R61-1)', () => {
  let server: Server;
  const received: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString('utf8')));
      req.on('end', () => {
        received.push(body);
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('is off without SENTRY_DSN', () => {
    expect(initSentry(undefined, 'test')).toBe(false);
    expect(initSentry('  ', 'test')).toBe(false);
    expect(sentryEnabled()).toBe(false);
    expect(captureError(new Error('nobody hears this'))).toBeNull();
  });

  it('sends a forced error with phone numbers and IC numbers taken out', async () => {
    const { port } = server.address() as AddressInfo;
    process.env.NO_PROXY = '127.0.0.1,localhost';
    expect(initSentry(`http://publickey@127.0.0.1:${port}/1`, 'test')).toBe(true);
    const id = captureError(new Error('Payout failed for +60 12-345 6789, IC 900101-14-5678'));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    await flushSentry();
    const event = received.flatMap((b) => b.split('\n')).map((l) => JSON.parse(l) as { exception?: { values: { value: string }[] } }).find((e) => e.exception);
    expect(event?.exception?.values[0].value).toBe('Payout failed for [removed], IC [removed]');
  });
});
