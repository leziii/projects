import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StatusChange } from '@pawpal/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';
import { DbService } from '../src/db/db.service';
import { HistoryService } from '../src/history/history.service';

// E1-4: every status change writes exactly one history row with who / when / why (rule G9).
describe('E1-4 status history', () => {
  let app: INestApplication;
  const run = randomUUID().slice(0, 8);
  let n = 0;
  const ref = () => `h${run}-${++n}`;
  let adminHeader: Record<string, string> = {};
  // Admin routes need an admin login (E2-4); the same header on public routes does no harm.
  const http = () => request.agent(app.getHttpServer()).set(adminHeader);

  const charge = async () => (await http().post('/api/payments/charges').send({ ref: ref(), amountSen: 4000, method: 'duitnow' }).expect(201)).body;
  const outcome = (id: number, outcome: string) => http().post(`/api/mock-gateway/payments/${id}/outcome`).send({ outcome }).expect(200);
  const history = async (id: number, entity = 'payment'): Promise<StatusChange[]> =>
    (await http().get(`/api/history/${entity}/${id}`).expect(200)).body;
  const steps = (h: StatusChange[]) => h.map((c) => `${c.fromStatus ?? '-'}>${c.toStatus} by ${c.actorType}`);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    adminHeader = (await adminLogin(app)).header;
  });

  afterAll(() => app.close());

  it('creating a payment writes one row: who, when, why', async () => {
    const c = await charge();
    const h = await history(c.id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ entity: 'payment', entityId: c.id, fromStatus: null, toStatus: 'pending', actorType: 'system', actorId: null });
    expect(h[0].reason).toBe(`charge created (${c.ref})`);
    expect(h[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('success adds one row by the gateway; repeats and late webhooks add none', async () => {
    const c = await charge();
    await outcome(c.id, 'success');
    await http().post(`/api/mock-gateway/payments/${c.id}/resend`).expect(200);
    await http().post(`/api/mock-gateway/payments/${c.id}/resend`).expect(200);
    await outcome(c.id, 'failure');
    const h = await history(c.id);
    expect(steps(h)).toEqual(['->pending by system', 'pending>succeeded by gateway']);
    expect(h[1].reason).toMatch(/^Gateway webhook evt_/);
  });

  it('unknown → checking → query: each step logged once', async () => {
    const c = await charge();
    await outcome(c.id, 'unknown');
    await http().post(`/api/payments/${c.id}/query`).expect(200);
    await http().post(`/api/payments/${c.id}/query`).expect(200);
    const h = await history(c.id);
    expect(steps(h)).toEqual(['->pending by system', 'pending>checking by gateway', 'checking>succeeded by gateway']);
    expect(h.map((x) => x.reason).slice(1)).toEqual(['No callback from the gateway (mock: unknown)', 'Result found by gateway query']);
  });

  it('payer return is logged as the owner; a return after the result adds nothing', async () => {
    const c = await charge();
    await http().post(`/api/payments/${c.id}/return`).expect(200);
    await http().post(`/api/payments/${c.id}/return`).expect(200);
    await outcome(c.id, 'failure');
    await http().post(`/api/payments/${c.id}/return`).expect(200);
    expect(steps(await history(c.id))).toEqual(['->pending by system', 'pending>checking by owner', 'checking>failed by gateway']);
  });

  it('refunds and payouts have their own history', async () => {
    const c = await charge();
    await outcome(c.id, 'success');
    const r = (await http().post('/api/payments/refunds').send({ ref: ref(), chargeId: c.id, amountSen: 1000 }).expect(201)).body;
    await outcome(r.id, 'failure');
    expect(steps(await history(r.id))).toEqual(['->pending by system', 'pending>failed by gateway']);
    const p = (await http().post('/api/payments/payouts').send({ ref: ref(), amountSen: 3400, payee: 'cg-1' }).expect(201)).body;
    expect(steps(await history(p.id))).toEqual(['->pending by system']);
  });

  it('a change and its history row are saved together or not at all', async () => {
    const c = await charge();
    const db = app.get(DbService);
    const hist = app.get(HistoryService);
    await expect(
      db.tx(async (conn) => {
        await conn.query("UPDATE payments SET status = 'failed' WHERE id = $1", [c.id]);
        await hist.record(conn, { entity: 'payment', entityId: c.id, from: 'pending', to: 'failed', actor: { type: 'admin', id: 'kf' }, reason: 'ok' });
      }),
    ).rejects.toThrow('Admin changes need a reason');
    expect((await http().get(`/api/payments/${c.id}`)).body.status).toBe('pending');
    expect(await history(c.id)).toHaveLength(1);
  });

  it('admin changes keep the admin id and reason', async () => {
    const c = await charge();
    const db = app.get(DbService);
    const hist = app.get(HistoryService);
    await db.tx((conn) =>
      hist.record(conn, { entity: 'payment', entityId: c.id, from: 'pending', to: 'pending', actor: { type: 'admin', id: 'kf' }, reason: 'Checked with bank' }),
    );
    expect((await history(c.id))[1]).toMatchObject({ actorType: 'admin', actorId: 'kf', reason: 'Checked with bank' });
  });

  it('rejects a bad entity name; unknown ids have no history', async () => {
    expect((await http().get('/api/history/Bad;Name/1').expect(400)).body.code).toBe('BAD_ENTITY');
    expect(await history(999999999)).toEqual([]);
  });
});

describe('E1-4 times are Malaysia time', () => {
  it('database sessions use Malaysia time', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = mod.createNestApplication();
    await app.init();
    const { rows } = await app.get(DbService).pool.query<{ tz: string }>("SELECT current_setting('TimeZone') AS tz");
    expect(rows[0].tz).toBe('Asia/Kuala_Lumpur');
    await app.close();
  });
});
