import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';
import { MOCK_SIGNATURE_HEADER, MockGateway } from '../src/payments/mock-gateway';

// E1-3: mock gateway. Success, failure, unknown and duplicate webhooks each end in exactly one result.
describe('E1-3 payments with the mock gateway', () => {
  let app: INestApplication;
  const run = randomUUID().slice(0, 8);
  let n = 0;
  const ref = () => `t${run}-${++n}`;
  let adminHeader: Record<string, string> = {};
  // Admin routes need an admin login (E2-4); the same header on public routes does no harm.
  const http = () => request.agent(app.getHttpServer()).set(adminHeader);

  const charge = async (amountSen = 4000) =>
    (await http().post('/api/payments/charges').send({ ref: ref(), amountSen, method: 'tng' }).expect(201)).body;
  const outcome = async (id: number, outcome: string) =>
    (await http().post(`/api/mock-gateway/payments/${id}/outcome`).send({ outcome }).expect(200)).body;
  const paidCharge = async (amountSen = 4000) => {
    const c = await charge(amountSen);
    await outcome(c.id, 'success');
    return c;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    adminHeader = (await adminLogin(app)).header;
  });

  afterAll(() => app.close());

  it('a new charge is pending and has a gateway reference', async () => {
    const c = await charge();
    expect(c).toMatchObject({ kind: 'charge', amountSen: 4000, method: 'tng', status: 'pending', gateway: 'mock', webhooks: 0 });
    expect(c.gatewayRef).toMatch(/^mock_ch_/);
  });

  it('success webhook → succeeded', async () => {
    const c = await charge();
    const res = await outcome(c.id, 'success');
    expect(res.webhook).toBe('applied');
    expect(res.payment).toMatchObject({ status: 'succeeded', webhooks: 1, failureReason: null });
  });

  it('failure webhook → failed with a reason', async () => {
    const c = await charge();
    const res = await outcome(c.id, 'failure');
    expect(res.payment).toMatchObject({ status: 'failed', failureReason: 'Declined by bank (mock)' });
  });

  it('unknown → checking, then a gateway query finds the result', async () => {
    const c = await charge();
    const res = await outcome(c.id, 'unknown');
    expect(res).toMatchObject({ webhook: 'none', payment: { status: 'checking' } });
    const after = (await http().post(`/api/payments/${c.id}/query`).expect(200)).body;
    expect(after.status).toBe('succeeded');
  });

  it('query on a still-pending payment keeps it pending', async () => {
    const c = await charge();
    expect((await http().post(`/api/payments/${c.id}/query`).expect(200)).body.status).toBe('pending');
  });

  it('duplicate webhook is recorded once and changes nothing', async () => {
    const c = await paidCharge();
    for (let i = 0; i < 3; i++) {
      const res = (await http().post(`/api/mock-gateway/payments/${c.id}/resend`).expect(200)).body;
      expect(res.webhook).toBe('duplicate');
      expect(res.payment).toMatchObject({ status: 'succeeded', webhooks: 1 });
    }
  });

  it('a late opposite webhook cannot change a final result', async () => {
    const c = await paidCharge();
    const res = await outcome(c.id, 'failure');
    expect(res.webhook).toBe('ignored');
    expect(res.payment.status).toBe('succeeded');
  });

  it('the same webhook sent at the same moment is applied once', async () => {
    const c = await charge();
    const mock = new MockGateway('dev-mock-secret');
    const raw = JSON.stringify({ eventId: `evt_${ref()}`, gatewayRef: c.gatewayRef, type: 'payment.succeeded' });
    const send = () =>
      http()
        .post('/api/payments/webhooks/mock')
        .set('content-type', 'application/json')
        .set(MOCK_SIGNATURE_HEADER, mock.sign(Buffer.from(raw)))
        .send(raw)
        .expect(200);
    const results = (await Promise.all([send(), send(), send()])).map((r) => r.body.result).sort();
    expect(results).toEqual(['applied', 'duplicate', 'duplicate']);
    expect((await http().get(`/api/payments/${c.id}`).expect(200)).body).toMatchObject({ status: 'succeeded', webhooks: 1 });
  });

  it('rejects a webhook with a bad signature, and an unknown gateway', async () => {
    const c = await charge();
    const raw = JSON.stringify({ eventId: `evt_${ref()}`, gatewayRef: c.gatewayRef, type: 'payment.succeeded' });
    const res = await http()
      .post('/api/payments/webhooks/mock')
      .set('content-type', 'application/json')
      .set(MOCK_SIGNATURE_HEADER, 'forged')
      .send(raw)
      .expect(400);
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE');
    await http().post('/api/payments/webhooks/stripe').send(raw).expect(404);
    expect((await http().get(`/api/payments/${c.id}`)).body.status).toBe('pending');
  });

  it('same ref twice → one payment; same ref with other details → REF_CONFLICT', async () => {
    const r = ref();
    const a = (await http().post('/api/payments/charges').send({ ref: r, amountSen: 6000, method: 'fpx' }).expect(201)).body;
    const b = (await http().post('/api/payments/charges').send({ ref: r, amountSen: 6000, method: 'fpx' }).expect(201)).body;
    expect(b.id).toBe(a.id);
    const c = await http().post('/api/payments/charges').send({ ref: r, amountSen: 7000, method: 'fpx' }).expect(400);
    expect(c.body.code).toBe('REF_CONFLICT');
  });

  it('same ref sent at the same moment → one payment', async () => {
    const r = ref();
    const send = () => http().post('/api/payments/charges').send({ ref: r, amountSen: 4000, method: 'card' }).expect(201);
    const ids = new Set((await Promise.all([send(), send(), send(), send()])).map((x) => x.body.id));
    expect(ids.size).toBe(1);
  });

  it('payer return only marks checking; it never decides the result', async () => {
    const c = await charge();
    expect((await http().post(`/api/payments/${c.id}/return`).expect(200)).body.status).toBe('checking');
    const paid = await paidCharge();
    expect((await http().post(`/api/payments/${paid.id}/return`).expect(200)).body.status).toBe('succeeded');
  });

  it('refunds: only paid charges, never more than paid, failed refunds free the amount', async () => {
    const unpaid = await charge();
    const r0 = await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: unpaid.id, amountSen: 100 }).expect(400);
    expect(r0.body.code).toBe('CHARGE_NOT_PAID');

    const c = await paidCharge(4000);
    const r1 = (await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 1000 }).expect(201)).body;
    expect(r1).toMatchObject({ kind: 'refund', parentId: c.id, status: 'pending' });
    expect(r1.gatewayRef).toMatch(/^mock_rf_/);
    const r2 = (await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 3000 }).expect(201)).body;
    const tooMuch = await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 1 }).expect(400);
    expect(tooMuch.body.code).toBe('REFUND_TOO_MUCH');

    await outcome(r1.id, 'success');
    await outcome(r2.id, 'failure');
    await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 3000 }).expect(201);
  });

  it('refunds asked at the same moment never add up to more than paid', async () => {
    const c = await paidCharge(4000);
    const send = () => http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 3000 });
    const codes = (await Promise.all([send(), send(), send()])).map((r) => r.status).sort();
    expect(codes).toEqual([201, 400, 400]);
  });

  it('payout: success once, repeats do nothing', async () => {
    const r = ref();
    const p = (await http().post('/api/payments/payouts').send({ ref: r, amountSen: 3400, payee: 'caregiver-1' }).expect(201)).body;
    expect(p.gatewayRef).toMatch(/^mock_po_/);
    await outcome(p.id, 'success');
    const again = (await http().post('/api/payments/payouts').send({ ref: r, amountSen: 3400, payee: 'caregiver-1' }).expect(201)).body;
    expect(again).toMatchObject({ id: p.id, status: 'succeeded' });
    expect((await http().post(`/api/mock-gateway/payments/${p.id}/resend`).expect(200)).body.webhook).toBe('duplicate');
  });

  it('rejects bad input with clear codes', async () => {
    const bad = async (path: string, body: object, code: string) =>
      expect((await http().post(path).send(body).expect(400)).body.code).toBe(code);
    await bad('/api/payments/charges', { ref: 'x y', amountSen: 100, method: 'tng' }, 'BAD_REF');
    await bad('/api/payments/charges', { ref: ref(), amountSen: 0, method: 'tng' }, 'BAD_AMOUNT');
    await bad('/api/payments/charges', { ref: ref(), amountSen: 10.5, method: 'tng' }, 'BAD_AMOUNT');
    await bad('/api/payments/charges', { ref: ref(), amountSen: 100, method: 'cash' }, 'BAD_METHOD');
    await bad('/api/payments/refunds', { ref: ref(), chargeId: 'x', amountSen: 100 }, 'BAD_CHARGE');
    await bad('/api/payments/payouts', { ref: ref(), amountSen: 100 }, 'BAD_PAYEE');
    const c = await charge();
    await bad(`/api/mock-gateway/payments/${c.id}/outcome`, { outcome: 'maybe' }, 'BAD_OUTCOME');
    await bad(`/api/mock-gateway/payments/${c.id}/resend`, {}, 'NO_WEBHOOK');
    await http().get('/api/payments/999999999').expect(404);
  });

  it('lists the latest payments, newest first', async () => {
    const c = await charge();
    const list = (await http().get('/api/payments').expect(200)).body;
    expect(list[0].id).toBe(c.id);
    expect(list.length).toBeLessThanOrEqual(50);
  });
});
