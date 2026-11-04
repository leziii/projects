import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, klDate, type BookingDraft, type InviteInfo, type OrderView, type PayProblem, type Promo } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/bookings/orders.service';
import { DbService } from '../src/db/db.service';
import { RedisService } from '../src/redis/redis.service';
import { PAYMENT_GATEWAY } from '../src/payments/gateway';
import { adminLogin } from './admin-helper';

// E5-4: confirm and pay (O10). The order is made at Pay with prices locked; the result comes from the gateway.
describe('E5-4 confirm and pay', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const day = addDays(klDate(new Date()), 3);
  const address = { label: 'Home', area: 'Setapak', street: '12 Jalan Genting', unit: 'A-3-1', postcode: '53300', contactName: 'Ali', contactPhone: '012-345 6789' };
  const db = () => app.get(DbService).pool;

  async function login(ref?: string) {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true, ref }).expect(200)).body;
    const { id } = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    return { phone, token: token as string, id: id as number };
  }

  async function pet(ownerId: number, status: string, name: string): Promise<number> {
    const { rows } = await db().query(
      `INSERT INTO pets (owner_id, kind, name, birth_year, birth_month, vaccinated, status) VALUES ($1, 'cat', $2, 2022, 1, true, $3) RETURNING id`,
      [ownerId, name, status],
    );
    return Number(rows[0].id);
  }

  async function caregiver(name: string) {
    const c = await login();
    await http().post('/api/dev/caregiver-status').send({ phone: c.phone, status: 'approved', reason: 'test setup' }).expect(201);
    await http().get('/api/caregiver/profile').set(auth(c.token)).expect(200);
    await db().query('UPDATE caregiver_profiles SET display_name = $2, areas = $3, cats = true WHERE user_id = $1', [c.id, name, ['Setapak']]);
    return c;
  }

  /** An owner whose booking is ready to pay: one approved cat, one visit, a caregiver, live confirm. */
  async function ready(ref?: string) {
    const o = await login(ref);
    const a = (await http().post('/api/addresses').set(auth(o.token)).send(address).expect(201)).body;
    const mimi = await pet(o.id, 'approved', 'Mimi');
    const cg = await caregiver('Siti Aminah');
    const input = { petIds: [mimi], level: 'basic', overtimeUnits: 1, addressId: a.id, visits: [{ date: day, start: 600 }, { date: addDays(day, 1), start: 600 }] };
    await http().post('/api/bookings/draft').set(auth(o.token)).send(input).expect(200);
    await http().post('/api/bookings/draft/caregiver').set(auth(o.token)).send({ caregiverId: cg.id }).expect(200);
    await http().post('/api/bookings/draft/entry').set(auth(o.token)).send({ method: 'pre_authorised', keyLock: 'Code 4821#', guard: '', notes: '' }).expect(200);
    return { ...o, input, cg, mimi };
  }

  const pay = (token: string, body: object = { healthConfirmed: true, method: 'tng' }) => http().post('/api/bookings/draft/pay').set(auth(token)).send(body);
  const outcome = (paymentId: number, o: string) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: o }).expect(200);
  const order = async (token: string, id: number): Promise<OrderView> => (await http().get(`/api/orders/${id}`).set(auth(token)).expect(200)).body;
  const status = async (id: number) => (await db().query('SELECT status FROM orders WHERE id = $1', [id])).rows[0].status as string;
  const messages = async (ownerId: number) =>
    (await db().query<{ id: number; category: string; title: string; body: string; link_type: string; link_id: number }>('SELECT * FROM messages WHERE user_id = $1 ORDER BY id', [ownerId])).rows;
  /** Moves the order's only visit to this many hours from now (KL time), as if the payment came in late. */
  async function firstVisitIn(orderId: number, hours: number) {
    const at = new Date(Date.now() + hours * 3600e3 + 8 * 3600e3);
    const visit = { date: at.toISOString().slice(0, 10), start: at.getUTCHours() * 60 + at.getUTCMinutes(), label: 'soon', quote: {} };
    await db().query('UPDATE orders SET visits = $2 WHERE id = $1', [orderId, JSON.stringify([visit])]);
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('lists what still stops payment, and refuses Pay until it is all done', async () => {
    await http().get('/api/bookings/draft/checkout').expect(401);
    const o = await login();
    const mimi = await pet(o.id, 'pending', 'Mimi');
    await http().post('/api/addresses').set(auth(o.token)).send(address).expect(201);
    await http().post('/api/bookings/draft').set(auth(o.token)).send({ petIds: [mimi], visits: [{ date: day, start: 600 }] }).expect(200);
    const c: { draft: BookingDraft; problems: PayProblem[] } = (await http().get('/api/bookings/draft/checkout').set(auth(o.token)).expect(200)).body;
    expect(c.problems).toEqual([
      { text: 'Mimi: still being checked. You can pay once approved', fix: 'pets' },
      { text: 'Choose a caregiver', fix: 'caregiver' },
      { text: 'Say how the caregiver gets in', fix: 'entry' },
    ]);
    expect((await pay(o.token).expect(409)).body.code).toBe('PAY_BLOCKED');

    const r = await ready();
    expect((await http().get('/api/bookings/draft/checkout').set(auth(r.token)).expect(200)).body.problems).toEqual([]);
    expect((await pay(r.token, { method: 'tng' }).expect(400)).body.code).toBe('HEALTH_NOT_CONFIRMED');
    expect((await pay(r.token, { healthConfirmed: true, method: 'cash' }).expect(400)).body.code).toBe('BAD_METHOD');
  });

  it('makes the order with prices locked; paying twice reuses the same charge; success waits for the caregiver', async () => {
    const r = await ready();
    const first: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    expect(first.order).toMatchObject({ status: 'awaiting_payment', caregiver: { id: r.cg.id, displayName: 'Siti A.' }, pets: [{ id: r.mimi, name: 'Mimi', kind: 'cat' }], level: 'basic', entryMethod: 'pre_authorised', paidAt: null });
    expect(first.order.number).toMatch(/^P\d{8}\d{3,}$/);
    expect(first.order.visits.map((v) => v.date)).toEqual([day, addDays(day, 1)]);
    expect(first.order.totalSen).toBe(first.order.visits.reduce((s, v) => s + v.quote.total, 0));
    expect(first.order.payment).toMatchObject({ id: first.paymentId, status: 'pending', method: 'tng' });

    const again: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    expect(again.order.id).toBe(first.order.id);
    expect(again.paymentId).toBe(first.paymentId);

    const locked = await db().query('SELECT total_sen, entry_secret FROM orders WHERE id = $1', [first.order.id]);
    expect(locked.rows[0].entry_secret).toMatch(/^v1\./);

    await outcome(first.paymentId, 'success');
    // The callback alone moves the order on, before the app asks (R22-5).
    expect(await status(first.order.id)).toBe('pending_accept');
    const paid = await order(r.token, first.order.id);
    expect(paid.status).toBe('pending_accept');
    expect(paid.paidAt).not.toBeNull();
    // First visit days away: 3 hours to accept (R22-1).
    expect(paid.acceptKind).toBe('normal');
    expect(Date.parse(paid.acceptDeadline!.replace(' ', 'T') + '+08:00') - Date.parse(paid.paidAt!.replace(' ', 'T') + '+08:00')).toBe(3 * 3600e3);
    expect(paid.refundSen).toBe(0);
    const [msg] = await messages(r.id);
    expect(msg).toMatchObject({ category: 'order', link_type: 'order', link_id: first.order.id });
    expect(msg.title).toMatch(/^Payment received: RM\d+/);
    expect(msg.body).toContain(`Order ${paid.number} is paid. Waiting for Siti A. to accept by `);
    const opened = (await http().post(`/api/messages/${msg.id}/open`).set(auth(r.token)).expect(200)).body;
    expect(opened.latest.summary).toBe(`Order ${paid.number}: Paid, waiting for the caregiver to accept`);
    expect(paid.totalSen).toBe(locked.rows[0].total_sen);
    const { rows } = await db().query('SELECT 1 FROM booking_drafts WHERE owner_id = $1', [r.id]);
    expect(rows).toHaveLength(0);
    const history = (await db().query("SELECT to_status FROM status_history WHERE entity = 'order' AND entity_id = $1 ORDER BY id", [String(first.order.id)])).rows;
    expect(history.map((h) => h.to_status)).toEqual(['awaiting_payment', 'pending_accept']);

    // Another owner cannot see it.
    const stranger = await login();
    await http().get(`/api/orders/${first.order.id}`).set(auth(stranger.token)).expect(404);
  });

  it('a failed payment can be tried again on the same order; still checking is found by asking the gateway', async () => {
    const r = await ready();
    const first: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    // A server restart makes the test gateway forget; the open payment can still be answered.
    (Reflect.get(app.get(PAYMENT_GATEWAY), 'txns') as Map<string, unknown>).clear();
    await outcome(first.paymentId, 'failure');
    const failed = await order(r.token, first.order.id);
    expect(failed.status).toBe('awaiting_payment');
    expect(failed.payment?.status).toBe('failed');

    const retry: { order: OrderView; paymentId: number } = (await http().post(`/api/orders/${first.order.id}/pay`).set(auth(r.token)).send({ method: 'card' }).expect(200)).body;
    expect(retry.order.id).toBe(first.order.id);
    expect(retry.paymentId).not.toBe(first.paymentId);
    expect(retry.order.payment).toMatchObject({ status: 'pending', method: 'card' });

    await outcome(retry.paymentId, 'unknown');
    expect(await status(first.order.id)).toBe('awaiting_payment');
    // The background check asks the gateway, even if the owner closed the app (R22-2).
    await app.get(OrdersService).checkStuck();
    expect(await status(first.order.id)).toBe('pending_accept');
    const done = await order(r.token, first.order.id);
    expect(done.status).toBe('pending_accept');
    expect((await http().post(`/api/orders/${first.order.id}/pay`).set(auth(r.token)).send({ method: 'card' }).expect(409)).body.code).toBe('ORDER_NOT_UNPAID');
  });

  it('changing the booking before payment cancels the order; a late success is refunded in full', async () => {
    const r = await ready();
    const first: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    await http().post('/api/bookings/draft').set(auth(r.token)).send({ ...r.input, overtimeUnits: 0 }).expect(200);
    expect((await order(r.token, first.order.id)).status).toBe('cancelled');

    await outcome(first.paymentId, 'success');
    const late = await order(r.token, first.order.id);
    expect(late.status).toBe('cancelled');
    const refund = await db().query("SELECT amount_sen FROM payments WHERE kind = 'refund' AND parent_id = $1", [first.paymentId]);
    expect(refund.rows.map((x) => Number(x.amount_sen))).toEqual([first.order.totalSen]);
    expect(late.refundSen).toBe(first.order.totalSen);
    await order(r.token, first.order.id); // asking again refunds nothing more
    const told = (await messages(r.id)).filter((m) => m.category === 'refund');
    expect(told).toHaveLength(1);
    expect(told[0].body).toBe(`Order ${first.order.number} could not go ahead because the booking was changed before the payment came in. RM${first.order.totalSen / 100} is refunded in full to how you paid.`);

    // Paying again makes a new order at the new price.
    const next: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    expect(next.order.id).not.toBe(first.order.id);
    expect(next.order.totalSen).toBeLessThan(first.order.totalSen);
  });

  it('E5-5: a payment that lands under 3 h before the first visit fails the order with a full refund; under 6 h gives 30 min to accept', async () => {
    const r = await ready();
    const first: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
    await firstVisitIn(first.order.id, 2);
    await outcome(first.paymentId, 'success');
    const failed = await order(r.token, first.order.id);
    expect(failed).toMatchObject({ status: 'failed', acceptDeadline: null, refundSen: first.order.totalSen });
    const history = (await db().query("SELECT to_status, reason FROM status_history WHERE entity = 'order' AND entity_id = $1 ORDER BY id", [String(first.order.id)])).rows;
    expect(history.at(-1)).toEqual({ to_status: 'failed', reason: `Payment ${first.paymentId} came in under 3 h before the first visit` });
    const told = (await messages(r.id)).filter((m) => m.category === 'refund');
    expect(told.map((m) => m.body)).toEqual([
      `Order ${first.order.number} could not go ahead because the first visit was less than 3 hours away when the payment came in. RM${first.order.totalSen / 100} is refunded in full to how you paid.`,
    ]);
    // The draft is kept so the owner can pick new times.
    expect((await db().query('SELECT 1 FROM booking_drafts WHERE owner_id = $1', [r.id])).rows).toHaveLength(1);

    const u = await ready();
    const urgent: { order: OrderView; paymentId: number } = (await pay(u.token).expect(200)).body;
    await firstVisitIn(urgent.order.id, 5);
    await outcome(urgent.paymentId, 'success');
    const paid = await order(u.token, urgent.order.id);
    expect(paid.acceptKind).toBe('urgent');
    expect(Date.parse(paid.acceptDeadline!.replace(' ', 'T') + '+08:00') - Date.parse(paid.paidAt!.replace(' ', 'T') + '+08:00')).toBe(30 * 60e3);
  });

  describe('E5-6 promo codes', () => {
    const code = () => `T${randomInt(1e9)}`;
    const today = klDate(new Date());
    const base = { kind: 'amount', amountSen: 1000, startsOn: today, endsOn: addDays(today, 30), reason: 'Launch offer' };
    let admin: Awaited<ReturnType<typeof adminLogin>>;
    const create = async (body: object): Promise<Promo> => (await http().post('/api/admin/promos').set(admin.header).send({ ...base, code: code(), ...body }).expect(201)).body;
    const apply = (token: string, c: string) => http().post('/api/bookings/draft/promo').set(auth(token)).send({ code: c });
    const checkout = async (token: string) => (await http().get('/api/bookings/draft/checkout').set(auth(token)).expect(200)).body;

    beforeAll(async () => {
      admin = await adminLogin(app);
    });

    it('admins make codes with checks; only the Promo codes page may; codes are turned off, never deleted, with history', async () => {
      const other = await adminLogin(app, ['rules']);
      await http().get('/api/admin/promos').set(other.header).expect(403);
      const bad = async (body: object, errCode: string) => expect((await http().post('/api/admin/promos').set(admin.header).send({ ...base, code: code(), ...body }).expect(400)).body.code).toBe(errCode);
      await bad({ code: 'A-1' }, 'PROMO_CODE');
      await bad({ kind: 'percent', percent: 100 }, 'PROMO_PERCENT');
      await bad({ endsOn: addDays(today, -1) }, 'PROMO_DATES');
      await bad({ reason: 'x' }, 'REASON_REQUIRED');

      const c = code();
      const p = (await http().post('/api/admin/promos').set(admin.header).send({ ...base, code: c.toLowerCase(), kind: 'percent', percent: 20, maxSen: 3000, totalUses: 10 }).expect(201)).body as Promo;
      expect(p).toMatchObject({ code: c, kind: 'percent', percent: 20, maxSen: 3000, amountSen: null, totalUses: 10, active: true, used: 0, startsOn: today });
      expect((await http().post('/api/admin/promos').set(admin.header).send({ ...base, code: c }).expect(409)).body.code).toBe('PROMO_EXISTS');
      expect(((await http().get('/api/admin/promos').set(admin.header).expect(200)).body as Promo[]).some((x) => x.id === p.id)).toBe(true);

      await http().post(`/api/admin/promos/${p.id}/active`).set(admin.header).send({ active: false, reason: 'no' }).expect(400);
      const off: Promo = (await http().post(`/api/admin/promos/${p.id}/active`).set(admin.header).send({ active: false, reason: 'Budget used up' }).expect(200)).body;
      expect(off.active).toBe(false);
      const history = (await http().get(`/api/admin/promos/${p.id}/history`).set(admin.header).expect(200)).body;
      expect(history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['on', 'off']);
      expect(history[0].reason).toBe('Launch offer · 20% off, up to RM30');
    });

    it('owner applies a code on O10; the order keeps the discount per visit; the use counts when paid', async () => {
      const p = await create({ oncePerOwner: true });
      const r = await ready();
      expect((await apply(r.token, 'NOPE1234').expect(409)).body).toMatchObject({ code: 'PROMO_INVALID', message: 'There is no such code' });
      const c = (await apply(r.token, p.code.toLowerCase()).expect(200)).body;
      expect(c.promo).toEqual({ code: p.code, discountSen: 1000, payTotal: c.draft.summary.total - 1000 });
      expect(c.draft.promoCode).toBe(p.code);

      const first: { order: OrderView; paymentId: number } = (await pay(r.token).expect(200)).body;
      expect(first.order).toMatchObject({ promoCode: p.code, discountSen: 1000, paySen: first.order.totalSen - 1000 });
      expect(first.order.visits.map((v) => v.paidSen)).toEqual(first.order.visits.map((v) => v.quote.total - 500));
      const charge = await db().query('SELECT amount_sen FROM payments WHERE id = $1', [first.paymentId]);
      expect(Number(charge.rows[0].amount_sen)).toBe(first.order.paySen);
      const list = async () => ((await http().get('/api/admin/promos').set(admin.header).expect(200)).body as Promo[]).find((x) => x.id === p.id)!;
      expect((await list()).used).toBe(0); // held, not used yet

      await outcome(first.paymentId, 'success');
      const paid = await order(r.token, first.order.id);
      expect(paid.status).toBe('pending_accept');
      expect((await list()).used).toBe(1);
      const [msg] = await messages(r.id);
      expect(msg.title).toBe(`Payment received: RM${paid.paySen / 100}`);

      // Once per owner: the same owner cannot use it again.
      await http().post('/api/bookings/draft').set(auth(r.token)).send(r.input).expect(200);
      expect((await apply(r.token, p.code).expect(409)).body.message).toBe('You have already used this code');
    });

    it('a code that stops working blocks Pay with a fix link; removing it lets the owner pay full price', async () => {
      const p = await create({});
      const r = await ready();
      await apply(r.token, p.code).expect(200);
      await http().post(`/api/admin/promos/${p.id}/active`).set(admin.header).send({ active: false, reason: 'Ended early' }).expect(200);
      const c = await checkout(r.token);
      expect(c.promo).toBeNull();
      expect(c.problems).toEqual([{ text: `${p.code}: This code is turned off`, fix: 'promo' }]);
      expect((await pay(r.token).expect(409)).body.code).toBe('PAY_BLOCKED');
      const removed = (await http().post('/api/bookings/draft/promo/remove').set(auth(r.token)).expect(200)).body;
      expect(removed).toMatchObject({ problems: [], promo: null });
      expect((await pay(r.token).expect(200)).body.order).toMatchObject({ discountSen: 0, promoCode: null });
    });

    it('the last use cannot go to two owners; a cancelled order gives its use back', async () => {
      const p = await create({ totalUses: 1 });
      const a = await ready();
      const b = await ready();
      await apply(a.token, p.code).expect(200);
      await apply(b.token, p.code).expect(200);
      const aPay: { order: OrderView } = (await pay(a.token).expect(200)).body;
      // A is paying now, so B is stopped.
      expect((await checkout(b.token)).problems).toEqual([{ text: `${p.code}: This code has been fully used`, fix: 'promo' }]);
      expect((await pay(b.token).expect(409)).body.problems[0].fix).toBe('promo');

      // A changes the booking: the unpaid order is cancelled and the use is given back.
      await http().post('/api/bookings/draft').set(auth(a.token)).send({ ...a.input, overtimeUnits: 0 }).expect(200);
      expect(await status(aPay.order.id)).toBe('cancelled');
      expect((await checkout(b.token)).problems).toEqual([]);
      expect((await pay(b.token).expect(200)).body.order.discountSen).toBe(1000);
    });

    it('first order only, minimum spend, and % off with a cap', async () => {
      const r = await ready();
      const total = (await checkout(r.token)).draft.summary.total; // RM100: two visits of RM50
      const min = await create({ minSpendSen: total + 100 });
      expect((await apply(r.token, min.code).expect(409)).body.message).toBe(`Spend at least RM${(total + 100) / 100} to use this code`);
      const pct = await create({ kind: 'percent', amountSen: null, percent: 50, maxSen: 2000 });
      expect((await apply(r.token, pct.code).expect(200)).body.promo.discountSen).toBe(2000);

      const first = await create({ firstOrderOnly: true });
      const { paymentId } = (await pay(r.token).expect(200)).body; // pays with the 50% code
      await outcome(paymentId, 'success');
      await http().post('/api/bookings/draft').set(auth(r.token)).send(r.input).expect(200);
      expect((await apply(r.token, first.code).expect(409)).body.message).toBe('This code is for a first order only');
    });
  });

  describe('E5-7 invite friends', () => {
    const invite = async (token: string): Promise<InviteInfo> => (await http().get('/api/invite').set(auth(token)).expect(200)).body;
    const settle = (number: string) => http().post('/api/dev/order-settled').send({ number });

    it('every owner gets one invite code; only a brand-new account can join with it', async () => {
      await http().get('/api/invite').expect(401);
      const inviter = await login();
      const card = await invite(inviter.token);
      expect(card).toEqual({ code: expect.stringMatching(/^[A-HJ-KM-NP-Z2-9]{6}$/), joined: 0, rewarded: 0, credit: { balanceSen: 0, nextExpiry: null } });
      expect((await invite(inviter.token)).code).toBe(card.code);

      // A wrong code is refused before the login code is used, so the friend can fix it.
      const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
      const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
      expect((await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true, ref: 'ZZZZZZ' }).expect(400)).body.code).toBe('BAD_INVITE');
      expect((await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true, ref: card.code.toLowerCase() }).expect(200)).body.invite).toBe('joined');
      expect((await invite(inviter.token)).joined).toBe(1);

      // The same phone logging in again, or an old account, never joins later.
      await app.get(RedisService).client.del(`auth:wait:${inviter.phone}`);
      const { devCode: again } = (await http().post('/api/auth/code').send({ phone: inviter.phone }).expect(200)).body;
      const other = await login();
      const otherCard = await invite(other.token);
      // The login still works, but the app is told the code was not used, so the person is not left guessing.
      expect((await http().post('/api/auth/login').send({ phone: inviter.phone, code: again, acceptTerms: true, ref: otherCard.code }).expect(200)).body.invite).toBe('old_account');
      expect((await invite(other.token)).joined).toBe(0);
    });

    it("the friend's first settled order gives both RM10 credit, once", async () => {
      const inviter = await login();
      const { code } = await invite(inviter.token);
      const friend = await ready(code);
      const { order: o, paymentId } = (await pay(friend.token).expect(200)).body as { order: OrderView; paymentId: number };
      // Not paid yet: nothing to settle.
      expect((await settle(o.number).expect(404)).body.code).toBe('ORDER_NOT_FOUND');
      await outcome(paymentId, 'success');
      expect((await settle(o.number).expect(200)).body).toEqual({ number: o.number, rewarded: true });
      expect((await settle(o.number).expect(200)).body.rewarded).toBe(false);

      for (const who of [inviter, friend]) {
        const card = await invite(who.token);
        expect(card.credit.balanceSen).toBe(1000);
        expect(card.credit.nextExpiry! > addDays(klDate(new Date()), 360)).toBe(true);
        expect((await messages(who.id)).filter((m) => m.title === 'You got RM10 credit')).toHaveLength(1);
      }
      expect(await invite(inviter.token)).toMatchObject({ joined: 1, rewarded: 1 });
    });

    it('credit is used on O10 after the promo; it is held at Pay, given back on cancel and spent when paid', async () => {
      const inviter = await login();
      const friend = await ready((await invite(inviter.token)).code);
      const first = (await pay(friend.token).expect(200)).body as { order: OrderView; paymentId: number };
      await outcome(first.paymentId, 'success');
      await settle(first.order.number).expect(200);

      // The friend books again with RM10 credit and a RM5 promo code.
      await http().post('/api/bookings/draft').set(auth(friend.token)).send(friend.input).expect(200);
      await http().post('/api/bookings/draft/caregiver').set(auth(friend.token)).send({ caregiverId: friend.cg.id }).expect(200);
      await http().post('/api/bookings/draft/entry').set(auth(friend.token)).send({ method: 'live_confirm' }).expect(200);
      const admin = await adminLogin(app);
      const today = klDate(new Date());
      const promo = (await http().post('/api/admin/promos').set(admin.header).send({ code: `C${randomInt(1e9)}`, kind: 'amount', amountSen: 500, startsOn: today, endsOn: addDays(today, 5), reason: 'Credit test' }).expect(201)).body as Promo;
      await http().post('/api/bookings/draft/promo').set(auth(friend.token)).send({ code: promo.code }).expect(200);
      const c = (await http().get('/api/bookings/draft/checkout').set(auth(friend.token)).expect(200)).body;
      const total = c.draft.summary.total;
      expect(c).toMatchObject({ creditSen: 1000, payTotal: total - 500 - 1000, promo: { discountSen: 500 } });

      const second = (await pay(friend.token).expect(200)).body as { order: OrderView; paymentId: number };
      expect(second.order).toMatchObject({ discountSen: 500, creditSen: 1000, paySen: total - 1500 });
      const charge = await db().query('SELECT amount_sen FROM payments WHERE id = $1', [second.paymentId]);
      expect(Number(charge.rows[0].amount_sen)).toBe(total - 1500);
      expect((await invite(friend.token)).credit.balanceSen).toBe(0);
      // Paying again (e.g. after a failure) still shows the held credit on O10.
      expect((await http().get('/api/bookings/draft/checkout').set(auth(friend.token)).expect(200)).body.creditSen).toBe(1000);

      // Changing the booking cancels the unpaid order: the credit comes back.
      await http().post('/api/bookings/draft').set(auth(friend.token)).send({ ...friend.input, overtimeUnits: 0 }).expect(200);
      expect((await invite(friend.token)).credit.balanceSen).toBe(1000);

      const third = (await pay(friend.token).expect(200)).body as { order: OrderView; paymentId: number };
      await outcome(third.paymentId, 'success');
      expect((await order(friend.token, third.order.id)).creditSen).toBe(1000);
      expect((await invite(friend.token)).credit.balanceSen).toBe(0);
    });
  });
});
