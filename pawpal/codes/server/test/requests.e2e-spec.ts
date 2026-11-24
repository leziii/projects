import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, confirmByText, entryFromOf, klDate, klInstant, taskTime, visitIncome, type BookingDraft, type LocationFlagRow, type OrderDetail, type OrderPage, type OrderView, type RequestDetail, type RequestList, type TaskList, type AdminCaseRow, type CancelPreview, type CancelResult, type OvertimeInfo, type ExtraFee, type OrderRefunds, type User, visitTime, type AdminReviewRow, type CaregiverReviews, type OrderReview, type Review, type VisitCase, type VisitReport, type VisitTask, type ProblemReport, type AdminProblemRow, type AdminExceptionRow, type ExceptionDetail, type SubstituteCandidate, type SubstituteOffer, type SettleResult, type CaregiverIncome, type OrderSettlement, type MoneyItem, type MoneyDetail, type QueueCount, type AdminOrderPage, type AdminOrderDetail, type AdminOrderAddress, type RulesAdmin, ruleChangeText, tomorrowOf, type AdminExceptionRow as ExRow, type AdminCaseRow as CaseRow, type AdminProblemRow as ProbRow } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlertsService } from '../src/alerts/alerts.service';
import { AppModule } from '../src/app.module';
import { CancelService } from '../src/bookings/cancel.service';
import { CasesService } from '../src/bookings/cases.service';
import { OrdersService } from '../src/bookings/orders.service';
import { RefundsService } from '../src/bookings/refunds.service';
import { SettlementsService } from '../src/bookings/settlements.service';
import { ExtraFeesService } from '../src/bookings/extra-fees.service';
import { TrustService } from '../src/caregivers/trust.service';
import { DbService } from '../src/db/db.service';
import { RulesService } from '../src/rules/rules.service';
import { adminLogin } from './admin-helper';

// Area Cheras: no browser test uses it, so these caregivers never show up there.
// E6-1: the chosen caregiver sees the paid order as a request with its deadline (S01, S06; round 25).
describe('E6-1 caregiver sees requests', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const day = addDays(klDate(new Date()), 3);
  const address = { label: 'Home', area: 'Cheras', street: '12 Jalan Genting', unit: 'A-3-1', postcode: '53300', contactName: 'Ali', contactPhone: '012-345 6789' };
  const db = () => app.get(DbService).pool;

  async function login() {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    const { id } = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    return { phone, token: token as string, id: id as number };
  }

  async function caregiver() {
    const c = await login();
    await http().post('/api/dev/caregiver-status').send({ phone: c.phone, status: 'approved', reason: 'test setup' }).expect(201);
    await http().get('/api/caregiver/profile').set(auth(c.token)).expect(200);
    await db().query("UPDATE caregiver_profiles SET display_name = $2, areas = $3, cats = true, dogs = true, max_dog_size = 'large' WHERE user_id = $1", [c.id, 'Siti Aminah', ['Cheras']]);
    await http().post('/api/auth/role').set(auth(c.token)).send({ role: 'caregiver' }).expect(200);
    return c;
  }

  /** An owner pays for a cat and a dog, two visits, with this caregiver. Returns the paid order. */
  /** existing: order again as the same owner (same address), with the visits `shift` days later. */
  async function paidOrder(cg: { id: number }, existing?: Awaited<ReturnType<typeof login>>, shift = 0) {
    const o = existing ?? (await login());
    const a = existing ? (await http().get('/api/addresses').set(auth(o.token)).expect(200)).body[0] : (await http().post('/api/addresses').set(auth(o.token)).send(address).expect(201)).body;
    const pets: number[] = [];
    for (const [kind, name] of [['cat', 'Mimi'], ['dog', 'Bobo']]) {
      const { rows } = await db().query(`INSERT INTO pets (owner_id, kind, name, birth_year, birth_month, vaccinated, status, breed, weight_kg) VALUES ($1, $2, $3, 2022, 1, true, 'approved', $4, $5) RETURNING id`, [
        o.id,
        kind,
        name,
        kind === 'dog' ? 'Beagle' : null,
        kind === 'dog' ? 10 : null,
      ]);
      pets.push(Number(rows[0].id));
    }
    await http().post('/api/bookings/draft').set(auth(o.token)).send({ petIds: pets, level: 'basic', overtimeUnits: 0, addressId: a.id, visits: [{ date: addDays(day, shift + 1), start: 600 }, { date: addDays(day, shift), start: 540 }] }).expect(200);
    await http().post('/api/bookings/draft/caregiver').set(auth(o.token)).send({ caregiverId: cg.id }).expect(200);
    await http().post('/api/bookings/draft/entry').set(auth(o.token)).send({ method: 'live_confirm' }).expect(200);
    const { order, paymentId } = (await http().post('/api/bookings/draft/pay').set(auth(o.token)).send({ healthConfirmed: true, method: 'tng' }).expect(200)).body as { order: OrderView; paymentId: number };
    return { owner: o, order, paymentId };
  }
  const succeed = (paymentId: number) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: 'success' }).expect(200);
  const list = async (token: string): Promise<RequestList> => (await http().get('/api/requests').set(auth(token)).expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('only an approved caregiver in the caregiver role can see requests', async () => {
    await http().get('/api/requests').expect(401);
    const owner = await login();
    expect((await http().get('/api/requests').set(auth(owner.token)).expect(403)).body.code).toBe('NOT_APPROVED');
    const cg = await caregiver();
    await http().post('/api/auth/role').set(auth(cg.token)).send({ role: 'owner' }).expect(200);
    expect((await http().get('/api/requests').set(auth(cg.token)).expect(403)).body.code).toBe('ROLE_REQUIRED');
  });

  it('a paid order becomes a request for the chosen caregiver only, with area but no street (R25-1, R25-3)', async () => {
    const cg = await caregiver();
    const other = await caregiver();
    const { order, paymentId } = await paidOrder(cg);
    // Not paid yet: not a request.
    expect((await list(cg.token)).open).toEqual([]);
    await succeed(paymentId);

    expect((await http().get('/api/caregiver/home').set(auth(cg.token)).expect(200)).body).toEqual({ newRequests: 1, todayVisits: 0 });
    const { open, history } = await list(cg.token);
    expect(history).toEqual([]);
    const full = (await db().query('SELECT visits FROM orders WHERE id = $1', [order.id])).rows[0].visits as { quote: { total: number } }[];
    expect(open).toEqual([
      {
        orderId: order.id,
        number: order.number,
        urgent: false,
        deadline: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
        firstVisit: { date: day, start: 540 },
        visits: 2,
        area: 'Cheras',
        pets: '1 dog, 1 cat',
        incomeSen: full.reduce((s, v) => s + Math.round(v.quote.total * 0.85), 0),
      },
    ]);
    expect(JSON.stringify(open)).not.toMatch(/Genting|53300|A-3-1|Ali/);

    const detail: RequestDetail = (await http().get(`/api/requests/${order.id}`).set(auth(cg.token)).expect(200)).body;
    expect(detail).toMatchObject({ open: true, end: null, petList: [{ name: 'Mimi', kind: 'cat' }, { name: 'Bobo', kind: 'dog' }] });
    // Visits in time order, each with its own 85%.
    expect(detail.visitLines).toHaveLength(2);
    expect(detail.visitLines.reduce((s, v) => s + v.incomeSen, 0)).toBe(detail.incomeSen);
    expect(detail.visitLines[0].label).toContain(String(Number(day.slice(8))));
    expect(JSON.stringify(detail)).not.toMatch(/Genting|53300|A-3-1|Ali|entry/);

    expect((await list(other.token)).open).toEqual([]);
    expect((await http().get(`/api/requests/${order.id}`).set(auth(other.token)).expect(404)).body.code).toBe('REQUEST_NOT_FOUND');
  });

  it('paying alerts the caregiver at once, with a message that opens the request (R25-6)', async () => {
    const cg = await caregiver();
    const { order, paymentId } = await paidOrder(cg);
    await succeed(paymentId);
    const log = await db().query<{ kind: string; text: string }>('SELECT kind, text FROM alert_log WHERE user_id = $1 ORDER BY id', [cg.id]);
    expect(log.rows.map((r) => r.kind)).toContain('new_request');
    expect(log.rows[0].text).toContain('Cheras');
    expect(log.rows[0].text).not.toMatch(/Genting|53300/);
    const msg = await db().query("SELECT id, role, title, link_type, link_id FROM messages WHERE user_id = $1 AND category = 'order' ORDER BY id", [cg.id]);
    expect(msg.rows[0]).toMatchObject({ role: 'caregiver', link_type: 'request', link_id: order.id });
    expect(msg.rows[0].title).toMatch(/^New booking request · 2 h 5\d min left|^New booking request · 3 h 0 min left/);
    const opened = (await http().post(`/api/messages/${msg.rows[0].id}/open`).set(auth(cg.token)).expect(200)).body;
    expect(opened.latest).toMatchObject({ type: 'request', id: order.id, summary: `Request ${order.number}: Waiting for you`, gone: false });
    const reminder = await db().query('SELECT payload FROM scheduled_alerts WHERE user_id = $1', [cg.id]);
    expect(JSON.parse(reminder.rows[0].payload)).toMatchObject({ orderId: order.id });
  });

  it('a first visit under 6 h away is urgent with 30 minutes (R25-4)', async () => {
    const cg = await caregiver();
    const { order, paymentId } = await paidOrder(cg);
    // Move the visits to about 5 h from now, as if the owner booked a same-day visit.
    const at = new Date(Date.now() + 5 * 3600e3 + 8 * 3600e3);
    const date = at.toISOString().slice(0, 10);
    const start = Math.floor((at.getUTCHours() * 60 + at.getUTCMinutes()) / 30) * 30;
    const { rows } = await db().query('SELECT visits FROM orders WHERE id = $1', [order.id]);
    const visits = (rows[0].visits as object[]).map((v, i) => ({ ...v, date: addDays(date, i), start }));
    await db().query('UPDATE orders SET visits = $2 WHERE id = $1', [order.id, JSON.stringify(visits)]);
    await succeed(paymentId);
    const [card] = (await list(cg.token)).open;
    expect(card.urgent).toBe(true);
    const title = (await db().query("SELECT title FROM messages WHERE user_id = $1 AND category = 'order'", [cg.id])).rows[0].title as string;
    expect(title).toMatch(/^Urgent booking request · (29|30) min left$/);
  });

  it('at the deadline it moves to History as Expired, and the reminder is not sent (R25-5)', async () => {
    const cg = await caregiver();
    const { order, paymentId } = await paidOrder(cg);
    await succeed(paymentId);
    await http().post('/api/dev/request-expire').send({ number: 'P0' }).expect(404);
    await http().post('/api/dev/request-expire').send({ number: order.number.toLowerCase() }).expect(200);
    const { open, history } = await list(cg.token);
    expect(open).toEqual([]);
    expect(history).toEqual([expect.objectContaining({ orderId: order.id, number: order.number, end: 'expired', visits: 2, area: 'Cheras' })]);
    expect((await http().get('/api/caregiver/home').set(auth(cg.token)).expect(200)).body.newRequests).toBe(0);
    expect((await http().get(`/api/requests/${order.id}`).set(auth(cg.token)).expect(200)).body).toMatchObject({ open: false, end: 'expired' });

    const before = (await db().query('SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1', [cg.id])).rows[0].n;
    await db().query("UPDATE scheduled_alerts SET run_at = now() - interval '1 second' WHERE user_id = $1", [cg.id]);
    await app.get(AlertsService).runDue();
    expect((await db().query('SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1', [cg.id])).rows[0].n).toBe(before);
    expect((await db().query('SELECT done_at FROM scheduled_alerts WHERE user_id = $1', [cg.id])).rows[0].done_at).not.toBeNull();

    // History keeps 30 days.
    await db().query("UPDATE orders SET accept_deadline = now() - interval '31 days', updated_at = now() - interval '31 days' WHERE id = $1", [order.id]);
    expect((await list(cg.token)).history).toEqual([]);
  });

  it('a request still open gets its reminder', async () => {
    const cg = await caregiver();
    const { paymentId } = await paidOrder(cg);
    await succeed(paymentId);
    await db().query("UPDATE scheduled_alerts SET run_at = now() - interval '1 second' WHERE user_id = $1", [cg.id]);
    await app.get(AlertsService).runDue();
    const titles = (await db().query("SELECT title, link_type FROM messages WHERE user_id = $1 AND category = 'order' ORDER BY id", [cg.id])).rows;
    expect(titles[1]).toMatchObject({ title: 'Request closes in 10 min', link_type: 'request' });
  });

  it('a paused caregiver sees why, and no requests (R25-8)', async () => {
    const cg = await caregiver();
    expect((await http().get('/api/caregiver/paused').set(auth(cg.token)).expect(200)).body).toEqual({ paused: false, reason: null });
    await http().post('/api/dev/caregiver-status').send({ phone: cg.phone, status: 'suspended', reason: 'Missed two visits in a row' }).expect(201);
    expect((await http().get('/api/caregiver/paused').set(auth(cg.token)).expect(200)).body).toEqual({ paused: true, reason: 'Missed two visits in a row' });
    expect((await http().get('/api/requests').set(auth(cg.token)).expect(403)).body.code).toBe('NOT_APPROVED');
  });

  describe('E6-2 accept or reject the whole order', () => {
    const accept = (token: string, id: number) => http().post(`/api/requests/${id}/accept`).set(auth(token));
    const reject = (token: string, id: number, reason?: string) => http().post(`/api/requests/${id}/reject`).set(auth(token)).send({ reason });

    it('accept books the whole order, locks the visits in the schedule and tells the owner (R26-1, R26-3, R26-4, R26-6)', async () => {
      const cg = await caregiver();
      const other = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      // Before accepting: no street, no contact.
      expect((await http().get(`/api/requests/${order.id}`).set(auth(cg.token)).expect(200)).body.address).toBeNull();
      expect((await accept(other.token, order.id).expect(404)).body.code).toBe('REQUEST_NOT_FOUND');

      const detail: RequestDetail = (await accept(cg.token, order.id).expect(200)).body;
      expect(detail).toMatchObject({ open: false, end: 'accepted', address: { street: '12 Jalan Genting', unit: 'A-3-1', postcode: '53300', contactName: 'Ali', contactPhone: '+60123456789' } });
      expect(JSON.stringify(detail)).not.toMatch(/emergency|entry/i);

      const booked = await db().query('SELECT visit_date, start_min, source, label FROM booked_visits WHERE order_id = $1 ORDER BY visit_date', [order.id]);
      expect(booked.rows.map((r) => [r.start_min, r.source])).toEqual([
        [540, 'order'],
        [600, 'order'],
      ]);
      expect(booked.rows[0].label).toBe(`${order.number} · Mimi, Bobo`);
      const schedule = (await http().get('/api/caregiver/schedule').set(auth(cg.token)).expect(200)).body;
      expect(schedule.visits.filter((v: { label: string }) => v.label.startsWith(order.number))).toHaveLength(2);

      const seen: OrderView = (await http().get(`/api/orders/${order.id}`).set(auth(owner.token)).expect(200)).body;
      expect(seen.status).toBe('accepted');
      const msg = await db().query("SELECT title, body, link_type FROM messages WHERE user_id = $1 AND title LIKE '%accepted%'", [owner.id]);
      expect(msg.rows[0]).toMatchObject({ title: 'Siti A. accepted your booking', link_type: 'order' });
      expect(msg.rows[0].body).toContain(`Order ${order.number} is booked. First visit: `);

      const { open, history } = await list(cg.token);
      expect(open).toEqual([]);
      expect(history[0]).toMatchObject({ orderId: order.id, end: 'accepted' });
      // Only once (R26-6).
      expect((await accept(cg.token, order.id).expect(409)).body.code).toBe('REQUEST_CLOSED');
      expect((await reject(cg.token, order.id, 'other').expect(409)).body.code).toBe('REQUEST_CLOSED');
    });

    it('a clash with the schedule refuses the whole order and lists the clashing visit (R26-1)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      // Another booked visit at 9:30 on the first visit's day (plus the travel buffer) clashes with the 9:00 visit only.
      await http().post('/api/dev/test-visit').send({ phone: cg.phone, date: day, start: 570, minutes: 45 }).expect(201);
      const refused = (await accept(cg.token, order.id).expect(409)).body;
      expect(refused).toMatchObject({ code: 'SCHEDULE_CLASH', clashes: [{ date: day, start: 540 }] });
      expect(refused.message).toMatch(/^This visit clashes with your schedule: .+ · 9:00 am\. Free that time in your schedule, or say no\.$/);
      expect((await db().query('SELECT status FROM orders WHERE id = $1', [order.id])).rows[0].status).toBe('pending_accept');
      expect((await db().query('SELECT COUNT(*)::int AS n FROM booked_visits WHERE order_id = $1', [order.id])).rows[0].n).toBe(0);
    });

    it('at the deadline accept is refused: the deadline wins (R26-2)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await db().query('UPDATE orders SET accept_deadline = now() WHERE id = $1', [order.id]);
      expect((await accept(cg.token, order.id).expect(409)).body).toMatchObject({ code: 'REQUEST_CLOSED', message: 'This request is no longer open' });
    });

    it('reject needs a reason, fails the order with a full refund, and the owner never sees the reason (R26-5)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      expect((await reject(cg.token, order.id).expect(400)).body.code).toBe('BAD_REASON');
      expect((await reject(cg.token, order.id, 'busy').expect(400)).body.code).toBe('BAD_REASON');

      const detail: RequestDetail = (await reject(cg.token, order.id, 'too_far').expect(200)).body;
      expect(detail).toMatchObject({ open: false, end: 'rejected', address: null });
      const row = (await db().query('SELECT status, end_reason, reject_reason FROM orders WHERE id = $1', [order.id])).rows[0];
      expect(row).toEqual({ status: 'failed', end_reason: 'rejected', reject_reason: 'too_far' });

      const seen: OrderView = (await http().get(`/api/orders/${order.id}`).set(auth(owner.token)).expect(200)).body;
      expect(seen).toMatchObject({ status: 'failed', endReason: 'rejected', refundSen: seen.paySen });
      const msgs = (await db().query("SELECT category, title, body FROM messages WHERE user_id = $1 AND category = 'refund'", [owner.id])).rows;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].body).toContain('Siti A. could not take it. You can book again with another caregiver');
      expect(JSON.stringify(msgs)).not.toMatch(/far/i);
      expect((await list(cg.token)).history[0]).toMatchObject({ orderId: order.id, end: 'rejected' });
    });
  });

  describe('E6-3 deadlines enforced', () => {
    const orders = () => app.get(OrdersService);

    it('past the deadline the order fails with a full refund, once, and both sides are told (R27-1 … R27-3)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      const later = await paidOrder(cg);
      await succeed(later.paymentId);
      await db().query("UPDATE orders SET accept_deadline = now() - interval '1 second' WHERE id = $1", [order.id]);

      expect(await orders().expireDue()).toBeGreaterThanOrEqual(1);
      expect((await db().query('SELECT status, end_reason FROM orders WHERE id = $1', [order.id])).rows[0]).toEqual({ status: 'failed', end_reason: 'timeout' });
      // The other request still has time.
      expect((await db().query('SELECT status FROM orders WHERE id = $1', [later.order.id])).rows[0].status).toBe('pending_accept');

      const seen: OrderView = (await http().get(`/api/orders/${order.id}`).set(auth(owner.token)).expect(200)).body;
      expect(seen).toMatchObject({ status: 'failed', endReason: 'timeout', refundSen: seen.paySen });
      const refund = (await db().query("SELECT title, body FROM messages WHERE user_id = $1 AND category = 'refund'", [owner.id])).rows;
      expect(refund).toEqual([
        { title: `Refund: RM${seen.paySen / 100}`, body: `Order ${order.number}: Siti A. did not answer in time. RM${seen.paySen / 100} is refunded in full. You can book again with another caregiver.` },
      ]);
      const told = (await db().query("SELECT role, title, body, link_type FROM messages WHERE user_id = $1 AND title LIKE '%expired'", [cg.id])).rows;
      expect(told).toEqual([{ role: 'caregiver', title: `Request ${order.number} expired`, body: `Request ${order.number} expired. You did not answer in time.`, link_type: 'request' }]);

      // A second run changes nothing: one refund only.
      await orders().expireDue();
      expect((await db().query("SELECT COUNT(*)::int AS n FROM payments WHERE kind = 'refund' AND ref LIKE $1", [`order-${order.id}-refund-%`])).rows[0].n).toBe(1);
      expect((await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(409)).body.code).toBe('REQUEST_CLOSED');
      expect((await list(cg.token)).history.find((h) => h.orderId === order.id)).toMatchObject({ end: 'expired' });
    });

    it('the test tool expires and refunds at once (R27-5)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post('/api/dev/request-expire').send({ number: order.number }).expect(200);
      expect((await db().query('SELECT status, end_reason FROM orders WHERE id = $1', [order.id])).rows[0]).toEqual({ status: 'failed', end_reason: 'timeout' });
    });
  });

  describe('E6-4 owner withdraws', () => {
    const refunds = (id: number) => db().query("SELECT COUNT(*)::int AS n FROM payments WHERE kind = 'refund' AND ref LIKE $1", [`order-${id}-refund-%`]);

    it('withdraw while waiting: cancelled, full refund once, both told, accept refused (R28-1 … R28-6)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      const seen: OrderView = (await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200)).body;
      expect(seen).toMatchObject({ status: 'cancelled', endReason: 'withdrawn', refundSen: seen.paySen });
      const money = `RM${seen.paySen / 100}`;
      expect((await db().query("SELECT title, body FROM messages WHERE user_id = $1 AND category = 'refund'", [owner.id])).rows).toEqual([
        { title: `Refund: ${money}`, body: `Order ${order.number}: you withdrew. ${money} is refunded in full.` },
      ]);
      expect((await db().query("SELECT role, title, body, link_type FROM messages WHERE user_id = $1 AND title LIKE '%withdrawn'", [cg.id])).rows).toEqual([
        { role: 'caregiver', title: `Request ${order.number} withdrawn`, body: `Request ${order.number} withdrawn. The owner withdrew it.`, link_type: 'request' },
      ]);
      expect((await db().query("SELECT from_status, to_status, actor_type FROM status_history WHERE entity = 'order' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [order.id])).rows[0]).toEqual({
        from_status: 'pending_accept',
        to_status: 'cancelled',
        actor_type: 'owner',
      });

      const accept = (await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(409)).body;
      expect(accept).toMatchObject({ code: 'REQUEST_WITHDRAWN', message: 'The owner withdrew this request' });
      expect((await list(cg.token)).history.find((h) => h.orderId === order.id)).toMatchObject({ end: 'withdrawn' });

      // Twice: refused, still one refund.
      expect((await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(409)).body.code).toBe('NOT_WAITING');
      expect((await refunds(order.id)).rows[0].n).toBe(1);
    });

    it('after the caregiver accepted, withdraw is refused and says so (R28-6)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const body = (await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(409)).body;
      expect(body).toMatchObject({ code: 'ALREADY_ACCEPTED', message: 'Siti A. already accepted. The booking is confirmed.' });
      expect((await refunds(order.id)).rows[0].n).toBe(0);
    });

    it('withdraw and accept at the same moment: exactly one wins (R28-6)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      const [w, a] = await Promise.all([http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)), http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token))]);
      expect([w.status, a.status].sort()).toEqual([200, 409]);
      const { status } = (await db().query('SELECT status FROM orders WHERE id = $1', [order.id])).rows[0];
      expect(status).toBe(w.status === 200 ? 'cancelled' : 'accepted');
      expect((await refunds(order.id)).rows[0].n).toBe(w.status === 200 ? 1 : 0);
    });

    it('only the owner can withdraw, and only a paid order', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      const stranger = await login();
      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(stranger.token)).expect(404);
      expect((await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(409)).body.code).toBe('NOT_WAITING');
      await succeed(paymentId);
      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200);
    });
  });

  describe('E6-5 book again', () => {
    const withdrawn = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200);
      return { cg, owner, order };
    };

    it('copies the old order into the draft, not the caregiver or promo; paying makes a new order (R29-1 … R29-3, R29-6)', async () => {
      const { cg, owner, order } = await withdrawn();
      const d: BookingDraft = (await http().post(`/api/orders/${order.id}/rebook`).set(auth(owner.token)).send({}).expect(200)).body;
      expect(d.petIds).toEqual(order.pets.map((p) => p.id));
      expect({ level: d.level, overtimeUnits: d.overtimeUnits }).toEqual({ level: order.level, overtimeUnits: 0 });
      expect(d.visits).toEqual(order.visits.map(({ date, start }) => ({ date, start })));
      expect(d.entry?.method).toBe('live_confirm');
      expect(d.caregiver).toBeNull();
      expect(d.promoCode).toBeNull();
      expect(d.caregiverNote).toBe(`Copied from order ${order.number}. Choose a caregiver again.`);
      expect(d.summary.blocks).toEqual([]);

      await http().post('/api/bookings/draft/caregiver').set(auth(owner.token)).send({ caregiverId: cg.id }).expect(200);
      const again = (await http().post('/api/bookings/draft/pay').set(auth(owner.token)).send({ healthConfirmed: true, method: 'tng' }).expect(200)).body as { order: OrderView };
      expect(again.order.number).not.toBe(order.number);
      // The old order keeps its own refund.
      const old: OrderView = (await http().get(`/api/orders/${order.id}`).set(auth(owner.token)).expect(200)).body;
      expect(old).toMatchObject({ status: 'cancelled', endReason: 'withdrawn', refundSen: old.paySen });
      expect(again.order.refundSen).toBe(0);
    });

    it('asks before replacing a booking in progress (R29-5)', async () => {
      const { owner, order } = await withdrawn();
      await http().post('/api/bookings/draft').set(auth(owner.token)).send({ petIds: [], level: 'basic', overtimeUnits: 0, addressId: null, visits: [] }).expect(200);
      expect((await http().post(`/api/orders/${order.id}/rebook`).set(auth(owner.token)).send({}).expect(409)).body).toMatchObject({ code: 'DRAFT_EXISTS', message: 'Replace your current booking?' });
      const d: BookingDraft = (await http().post(`/api/orders/${order.id}/rebook`).set(auth(owner.token)).send({ replace: true }).expect(200)).body;
      expect(d.visits).toHaveLength(2);
    });

    it('leaves out visits now in the past and says so (R29-4)', async () => {
      const { owner, order } = await withdrawn();
      await db().query(`UPDATE orders SET visits = jsonb_set(visits, '{0,date}', '"2020-01-01"') WHERE id = $1`, [order.id]);
      const d: BookingDraft = (await http().post(`/api/orders/${order.id}/rebook`).set(auth(owner.token)).send({}).expect(200)).body;
      expect(d.visits).toHaveLength(1);
      expect(d.caregiverNote).toBe(`Copied from order ${order.number}. 1 visit was in the past and was removed. Choose a caregiver again.`);
    });

    it('only for the owner, and only after a failed or withdrawn order (R29-1)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      const stranger = await login();
      await succeed(paymentId);
      expect((await http().post(`/api/orders/${order.id}/rebook`).set(auth(owner.token)).send({ replace: true }).expect(409)).body.code).toBe('NOT_REBOOKABLE');
      await http().post(`/api/orders/${order.id}/rebook`).set(auth(stranger.token)).send({ replace: true }).expect(404);
    });
  });

  describe('E7-1 my orders', () => {
    const page = async (token: string, q = '') => (await http().get(`/api/orders${q}`).set(auth(token)).expect(200)).body as OrderPage;

    it('lists paid orders newest first with four filters; unpaid tries are left out (R30-2 … R30-4)', async () => {
      const cg = await caregiver();
      const first = await paidOrder(cg);
      const owner = first.owner;
      await succeed(first.paymentId);
      await http().post(`/api/orders/${first.order.id}/withdraw`).set(auth(owner.token)).expect(200);
      const booked = await paidOrder(cg, owner, 2);
      await succeed(booked.paymentId);
      await http().post(`/api/requests/${booked.order.id}/accept`).set(auth(cg.token)).expect(200);
      const waiting = await paidOrder(cg, owner, 4);
      await succeed(waiting.paymentId);
      await paidOrder(cg, owner, 6); // not paid: never listed

      const all = await page(owner.token);
      expect(all.rows.map((r) => r.number)).toEqual([waiting.order.number, booked.order.number, first.order.number]);
      expect(all.next).toBeNull();
      const [w, b, e] = all.rows;
      expect(w).toMatchObject({ status: 'pending_accept', visits: 2, refundSen: 0, firstVisit: { date: addDays(day, 4), start: 540 } });
      expect(w.acceptDeadline).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      expect(b).toMatchObject({ status: 'accepted', acceptDeadline: null });
      expect(e).toMatchObject({ status: 'cancelled', endReason: 'withdrawn', refundSen: e.paySen });

      expect((await page(owner.token, '?filter=waiting')).rows.map((r) => r.id)).toEqual([waiting.order.id]);
      expect((await page(owner.token, '?filter=booked')).rows.map((r) => r.id)).toEqual([booked.order.id]);
      expect((await page(owner.token, '?filter=ended')).rows.map((r) => r.id)).toEqual([first.order.id]);
      expect((await page(owner.token, '?filter=nonsense')).rows).toHaveLength(3);
      // Someone else sees none of them.
      expect((await page((await login()).token)).rows).toEqual([]);
    });

    it('gives 20 at a time (R30-5)', async () => {
      const cg = await caregiver();
      const first = await paidOrder(cg);
      await succeed(first.paymentId);
      for (let i = 0; i < 20; i++) await succeed((await paidOrder(cg, first.owner)).paymentId);
      const one = await page(first.owner.token);
      expect(one.rows).toHaveLength(20);
      expect(one.next).toBe(one.rows[19].id);
      const two = await page(first.owner.token, `?before=${one.next}`);
      expect(two.rows.map((r) => r.id)).toEqual([first.order.id]);
      expect(two.next).toBeNull();
    });
  });

  describe('E7-2 order detail', () => {
    it('has the visits, the owner\'s address and the refund the bank confirmed (R31-3, R31-4, R31-6)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      const get = async () => (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;

      const waiting = await get();
      expect(waiting).toMatchObject({ number: order.number, status: 'pending_accept', refundSen: 0, refundDoneSen: 0, entryMethod: 'live_confirm' });
      expect(waiting.visits).toHaveLength(2);
      // E7-3 O14 reads each visit's own price and length from here (R32-2).
      for (const v of waiting.visits) expect(v.quote.totalMinutes).toBeGreaterThan(0);
      expect(waiting.visits.reduce((n, v) => n + v.paidSen, 0)).toBe(waiting.paySen);
      expect(waiting.address).toEqual({ area: 'Cheras', street: '12 Jalan Genting', unit: 'A-3-1', postcode: '53300', contactName: 'Ali', contactPhone: '+60123456789' });

      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200);
      // Still with the bank: on its way, not refunded.
      await db().query("UPDATE payments SET status = 'pending' WHERE kind = 'refund' AND ref LIKE $1", [`order-${order.id}-refund-%`]);
      expect(await get()).toMatchObject({ refundSen: waiting.paySen, refundDoneSen: 0 });
      await db().query("UPDATE payments SET status = 'succeeded' WHERE kind = 'refund' AND ref LIKE $1", [`order-${order.id}-refund-%`]);
      expect(await get()).toMatchObject({ refundSen: waiting.paySen, refundDoneSen: waiting.paySen });

      const stranger = await login();
      await http().get(`/api/orders/${order.id}/detail`).set(auth(stranger.token)).expect(404);
    });
  });

  describe('E8-1 my tasks', () => {
    const tasks = async (token: string, q = '') => (await http().get(`/api/caregiver/tasks${q}`).set(auth(token)).expect(200)).body as TaskList;

    it('lists visits of accepted orders by day, with 14 days of counts (R33-2 … R33-5)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      const waiting = await paidOrder(cg, owner, 6);
      await succeed(waiting.paymentId);

      // Waiting requests are not tasks.
      expect((await tasks(cg.token, `?date=${day}`)).tasks).toEqual([]);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);

      const list = await tasks(cg.token, `?date=${day}`);
      expect(list.days).toHaveLength(14);
      expect(list.days[0].date).toBe(klDate(new Date()));
      expect(list.days.find((d) => d.date === day)!.count).toBe(1);
      expect(list.days.find((d) => d.date === addDays(day, 1))!.count).toBe(1);
      expect(list.date).toBe(day);
      expect(list.bufferMin).toBe(30);
      expect(list.tasks).toEqual([
        { orderId: order.id, index: order.visits.findIndex((v) => v.date === day), number: order.number, date: day, start: 540, minutes: order.visits.find((v) => v.date === day)!.quote.totalMinutes, area: 'Cheras', pets: [{ name: 'Mimi', kind: 'cat' }, { name: 'Bobo', kind: 'dog' }], status: 'todo', arrivedAt: null, enteredAt: null, enteredBy: null, reportedAt: null, locationRecorded: false, confirmedAt: null, confirmedBy: null, cancel: null, waitingAt: null },
      ]);
      // A date outside the 14 days falls back to today.
      expect((await tasks(cg.token, '?date=2020-01-01')).date).toBe(klDate(new Date()));
    });

    it('the home card counts today\'s tasks (R33-1)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      expect((await http().get('/api/caregiver/home').set(auth(cg.token)).expect(200)).body.todayVisits).toBe(0);
      await db().query(`UPDATE orders SET visits = jsonb_set(visits, '{0,date}', to_jsonb($2::text)) WHERE id = $1`, [order.id, klDate(new Date())]);
      expect((await http().get('/api/caregiver/home').set(auth(cg.token)).expect(200)).body.todayVisits).toBe(1);
    });

    it('only caregivers see tasks', async () => {
      const owner = await login();
      await http().get('/api/caregiver/tasks').set(auth(owner.token)).expect(403);
    });
  });

  describe('E8-2 visit details', () => {
    const viewed = async (id: number) =>
      (await db().query("SELECT COUNT(*)::int AS n FROM status_history WHERE entity = 'order' AND entity_id = $1 AND reason LIKE 'Entry instructions viewed%'", [id])).rows[0].n as number;

    it('shows pets, address and income; entry instructions only inside the window, and each opening is logged (R34-2 … R34-5)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      // Not accepted yet: no visit page.
      await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(404);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);

      const v = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      const first = order.visits[0];
      expect(v).toMatchObject({ orderId: order.id, index: 0, number: order.number, date: first.date, start: first.start, status: 'todo', level: 'basic', entryMethod: 'live_confirm', entry: null });
      expect(v.incomeSen).toBe(visitIncome(first));
      expect(v.entryFrom).toBe(entryFromOf(first));
      expect(v.petDetails.map((p) => [p.name, p.breed, p.weightKg])).toEqual([['Mimi', null, null], ['Bobo', 'Beagle', 10]]);
      expect(v.address).toMatchObject({ area: 'Cheras', street: '12 Jalan Genting', unit: 'A-3-1', contactName: 'Ali' });
      expect(await viewed(order.id)).toBe(0);

      // Move the visit to start in 30 min: the window is open.
      const kl = new Date(Date.now() + 8 * 3600_000);
      const start = kl.getUTCHours() * 60 + kl.getUTCMinutes() + 30;
      await db().query(`UPDATE orders SET visits = jsonb_set(jsonb_set(visits, '{0,date}', to_jsonb($2::text)), '{0,start}', to_jsonb($3::int)) WHERE id = $1`, [order.id, klDate(new Date()), start]);
      const open = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(open.entry).toEqual({ keyLock: '', guard: '', notes: '' });
      expect(await viewed(order.id)).toBe(1);
    });

    it('only the order\'s caregiver, and only a visit that exists', async () => {
      const cg = await caregiver();
      const other = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(other.token)).expect(404);
      await http().get(`/api/caregiver/tasks/${order.id}/9`).set(auth(cg.token)).expect(404);
    });
  });

  describe('E8-3 arrive and confirm entry', () => {
    const accepted = async (method: 'live_confirm' | 'pre_authorised' = 'live_confirm') => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      if (method !== 'live_confirm') await db().query('UPDATE orders SET entry_method = $2 WHERE id = $1', [order.id, method]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order };
    };
    const soon = (number: string, index = 0) => http().post('/api/dev/visit-soon').send({ number, index }).expect(200);
    const arrive = (token: string, id: number, i = 0) => http().post(`/api/caregiver/tasks/${id}/${i}/arrive`).set(auth(token));

    it('arrive works only from 30 minutes before, once; it records the time and the history (R35-1, R35-2)', async () => {
      const { cg, order } = await accepted();
      // Visit 1 is tomorrow: too early.
      const early = await arrive(cg.token, order.id).expect(409);
      expect(early.body).toMatchObject({ code: 'CANNOT_ARRIVE' });
      expect(early.body.message).toMatch(/^You can tap this from \d/);

      const moved = (await soon(order.number)).body as { date: string; start: number };
      expect(moved.date).toBe(klDate(new Date(Date.now() + 10 * 60_000)));
      const booked = (await db().query('SELECT visit_date::text AS d, start_min FROM booked_visits WHERE order_id = $1 ORDER BY id LIMIT 1', [order.id])).rows[0];
      expect([booked.d, booked.start_min]).toEqual([moved.date, moved.start]);

      const v = (await arrive(cg.token, order.id).expect(200)).body as VisitTask;
      expect(v.status).toBe('arrived');
      expect(Date.now() - Date.parse(v.arrivedAt!)).toBeLessThan(60_000);
      expect(v.enteredAt).toBeNull();
      expect((await arrive(cg.token, order.id).expect(409)).body.message).toBe('Arrival is already recorded');
      const h = await db().query("SELECT from_status, to_status FROM status_history WHERE entity = 'visit' AND entity_id = $1", [order.id]);
      expect(h.rows).toEqual([{ from_status: 'todo', to_status: 'arrived' }]);

      const tasks = (await http().get(`/api/caregiver/tasks?date=${moved.date}`).set(auth(cg.token)).expect(200)).body as TaskList;
      expect(tasks.tasks.find((t) => t.orderId === order.id)?.status).toBe('arrived');
    });

    it('pre-authorised: the caregiver confirms entry after arriving; the owner gets no message (R35-3)', async () => {
      const { cg, owner, order } = await accepted('pre_authorised');
      await soon(order.number);
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/enter`).set(auth(cg.token)).expect(409)).body.code).toBe('NOT_ARRIVED');
      const before = (await db().query("SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND title LIKE '%has arrived'", [owner.id])).rows[0].n;
      await arrive(cg.token, order.id).expect(200);
      expect((await db().query("SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND title LIKE '%has arrived'", [owner.id])).rows[0].n).toBe(before);
      const v = (await http().post(`/api/caregiver/tasks/${order.id}/0/enter`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(v).toMatchObject({ status: 'in_service', enteredBy: 'caregiver' });
      expect(v.enteredAt).not.toBeNull();
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/enter`).set(auth(cg.token)).expect(409)).body.message).toBe('Entry is already confirmed');
      // The owner cannot confirm a pre-authorised visit.
      expect((await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(409)).body.code).toBe('NOT_LIVE_CONFIRM');
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0]).toMatchObject({ status: 'in_service', enteredBy: 'caregiver' });
      expect(d.runs[1]).toEqual({ status: 'todo', arrivedAt: null, enteredAt: null, enteredBy: null, reportedAt: null, locationRecorded: false, confirmedAt: null, confirmedBy: null, cancel: null, waitingAt: null });
    });

    it('live confirm: the owner is told, confirms from the order, and the caregiver is told (R35-4, R35-5)', async () => {
      const { cg, owner, order } = await accepted();
      await soon(order.number);
      expect((await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(409)).body).toMatchObject({ code: 'NOT_ARRIVED', message: 'The caregiver has not arrived yet' });
      await arrive(cg.token, order.id).expect(200);
      const m = (await db().query("SELECT role, body, link_type, link_id FROM messages WHERE user_id = $1 AND title LIKE '%has arrived'", [owner.id])).rows;
      expect(m).toHaveLength(1);
      expect(m[0]).toMatchObject({ role: 'owner', link_type: 'order', link_id: order.id });
      expect(m[0].body).toMatch(/has arrived for the visit at .+\. Confirm to let them in\.$/);
      // Only the owner confirms a live-confirm visit.
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/enter`).set(auth(cg.token)).expect(409)).body.code).toBe('OWNER_CONFIRMS');
      const stranger = await login();
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(stranger.token)).expect(404);
      await http().post(`/api/orders/${order.id}/visits/9/confirm-entry`).set(auth(owner.token)).expect(404);

      const d = (await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0]).toMatchObject({ status: 'in_service', enteredBy: 'owner' });
      expect((await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(409)).body.code).toBe('ALREADY_ENTERED');
      const told = (await db().query("SELECT link_type FROM messages WHERE user_id = $1 AND title = 'The owner let you in'", [cg.id])).rows;
      expect(told).toEqual([{ link_type: 'request' }]);
      const v = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(v).toMatchObject({ status: 'in_service', enteredBy: 'owner' });
      const h = await db().query("SELECT to_status, actor_type FROM status_history WHERE entity = 'visit' AND entity_id = $1 ORDER BY id", [order.id]);
      expect(h.rows.map((r) => r.to_status)).toEqual(['arrived', 'in_service']);
    });

    it('only the order\'s caregiver can arrive; the dev tool needs a real order', async () => {
      const { order } = await accepted();
      const other = await caregiver();
      await soon(order.number);
      await arrive(other.token, order.id).expect(404);
      await http().post('/api/dev/visit-soon').send({ number: 'P00000000000', index: 0 }).expect(404);
    });
  });

  describe('E8-4 record service', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const inService = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order };
    };
    const base = (id: number) => `/api/caregiver/tasks/${id}/0`;

    it('needs the service to have started (R36-1)', async () => {
      const { cg, order } = await inService();
      expect((await http().post(`${base(order.id)}/check`).set(auth(cg.token)).send({ item: 'feed', done: true }).expect(409)).body.code).toBe('NOT_IN_SERVICE');
      expect((await http().post(`${base(order.id)}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(409)).body.code).toBe('NOT_IN_SERVICE');
      const v = (await http().get(base(order.id)).set(auth(cg.token)).expect(200)).body as VisitTask;
      // A cat and a dog: all four items.
      expect(v.checklist).toEqual([{ item: 'feed', done: false }, { item: 'water', done: false }, { item: 'litter', done: false }, { item: 'walk', done: false }]);
      expect(v.photos).toEqual([]);
    });

    it('ticks save at once; photos are saved, private, up to 9, and can be deleted (R36-3, R36-4, R36-7)', async () => {
      const { cg, owner, order } = await inService();
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      await http().post(`${base(order.id)}/arrive`).set(auth(cg.token)).expect(200);
      await http().post(`${base(order.id)}/enter`).set(auth(cg.token)).expect(200);

      let v = (await http().post(`${base(order.id)}/check`).set(auth(cg.token)).send({ item: 'walk', done: true }).expect(200)).body as VisitTask;
      expect(v.checklist.find((c) => c.item === 'walk')!.done).toBe(true);
      await http().post(`${base(order.id)}/check`).set(auth(cg.token)).send({ item: 'walk', done: true }).expect(200);
      v = (await http().post(`${base(order.id)}/check`).set(auth(cg.token)).send({ item: 'walk', done: false }).expect(200)).body;
      expect(v.checklist.every((c) => !c.done)).toBe(true);
      expect((await http().post(`${base(order.id)}/check`).set(auth(cg.token)).send({ item: 'nap', done: true }).expect(400)).body.code).toBe('BAD_ITEM');

      expect((await http().post(`${base(order.id)}/photos`).set(auth(cg.token)).attach('photo', Buffer.from('not an image'), 'a.txt').expect(400)).body.code).toBe('PHOTO_TYPE');
      for (let n = 1; n <= 9; n++) v = (await http().post(`${base(order.id)}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200)).body;
      expect(v.photos).toHaveLength(9);
      expect((await http().post(`${base(order.id)}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(409)).body.code).toBe('TOO_MANY_PHOTOS');

      const img = await http().get(`${base(order.id)}/photos/${v.photos[0]}`).set(auth(cg.token)).expect(200);
      expect(img.headers['content-type']).toBe('image/jpeg');
      expect(img.headers['cache-control']).toBe('private, no-store');
      // Others cannot see it: another caregiver, or the owner here (the owner sees it with the report, E9-1).
      const other = await caregiver();
      await http().get(`${base(order.id)}/photos/${v.photos[0]}`).set(auth(other.token)).expect(404);
      await http().get(`${base(order.id)}/photos/${v.photos[0]}`).set(auth(owner.token)).expect(403);

      v = (await http().post(`${base(order.id)}/photos/${v.photos[0]}/delete`).set(auth(cg.token)).expect(200)).body;
      expect(v.photos).toHaveLength(8);
      await http().post(`${base(order.id)}/photos/999999999/delete`).set(auth(cg.token)).expect(404);
    });
  });

  describe('E8-5 send the report', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const started = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      const base = `/api/caregiver/tasks/${order.id}/0`;
      await http().post(`${base}/arrive`).set(auth(cg.token)).expect(200);
      await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, base };
    };

    it('needs 3 photos and a note for unticked items; the note is a draft until sent (R37-1, R37-2)', async () => {
      const { cg, base } = await started();
      let r = await http().post(`${base}/report`).set(auth(cg.token)).expect(409);
      expect(r.body).toMatchObject({ code: 'REPORT_INCOMPLETE', message: 'Add at least 3 photos (0 so far)' });
      expect(r.body.problems).toEqual(['Add at least 3 photos (0 so far)', 'Add a note on why Feed, Fresh water, Litter, Walk were not done']);
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      r = await http().post(`${base}/report`).set(auth(cg.token)).expect(409);
      expect(r.body.message).toBe('Add a note on why Walk was not done');
      expect((await http().post(`${base}/note`).set(auth(cg.token)).send({ note: 'x'.repeat(501) }).expect(400)).body.code).toBe('NOTE_TOO_LONG');
      const v = (await http().post(`${base}/note`).set(auth(cg.token)).send({ note: 'Raining, played indoors' }).expect(200)).body as VisitTask;
      expect(v.note).toBe('Raining, played indoors');
      expect(((await http().get(base).set(auth(cg.token)).expect(200)).body as VisitTask).note).toBe('Raining, played indoors');
    });

    it('sending starts the owner\'s 12 h, tells the owner, and locks the report (R37-4, R37-5)', async () => {
      const { cg, owner, order, base } = await started();
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter', 'walk']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      const v = (await http().post(`${base}/report`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(v.status).toBe('report_sent');
      expect(Date.now() - klInstant(v.reportedAt!).getTime()).toBeLessThan(60_000);

      const m = (await db().query("SELECT title, body, link_type, link_id FROM messages WHERE user_id = $1 AND title LIKE 'Report for visit%'", [owner.id])).rows;
      expect(m).toHaveLength(1);
      const runId = Number((await db().query('SELECT id FROM visit_runs WHERE order_id = $1 AND idx = 0', [order.id])).rows[0].id);
      expect(m[0]).toMatchObject({ title: 'Report for visit 1 is ready', link_type: 'report', link_id: runId });
      expect(m[0].body).toBe(`Order ${order.number}: Siti A. sent the report for ${v.date} ${taskTime(v)}. Please check it by ${confirmByText(v.reportedAt!)}.`);
      const h = await db().query("SELECT to_status FROM status_history WHERE entity = 'visit' AND entity_id = $1 ORDER BY id", [order.id]);
      expect(h.rows.map((x) => x.to_status)).toEqual(['arrived', 'in_service', 'report_sent']);

      // Locked.
      expect((await http().post(`${base}/report`).set(auth(cg.token)).expect(409)).body.code).toBe('REPORT_LOCKED');
      expect((await http().post(`${base}/check`).set(auth(cg.token)).send({ item: 'feed', done: false }).expect(409)).body.code).toBe('REPORT_LOCKED');
      expect((await http().post(`${base}/note`).set(auth(cg.token)).send({ note: 'later' }).expect(409)).body.code).toBe('REPORT_LOCKED');
      expect((await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(409)).body.code).toBe('REPORT_LOCKED');
      expect((await http().post(`${base}/photos/${v.photos[0]}/delete`).set(auth(cg.token)).expect(409)).body.code).toBe('REPORT_LOCKED');
      // The photos can still be seen by the caregiver.
      await http().get(`${base}/photos/${v.photos[0]}`).set(auth(cg.token)).expect(200);

      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0]).toMatchObject({ status: 'report_sent', reportedAt: v.reportedAt });
    });
  });

  describe('E9-1 owner reads the report', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const sent = async (send = true) => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      const base = `/api/caregiver/tasks/${order.id}/0`;
      await http().post(`${base}/arrive`).set(auth(cg.token)).expect(200);
      await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      await http().post(`${base}/note`).set(auth(cg.token)).send({ note: 'No litter box, owner uses pads' }).expect(200);
      const v = send ? ((await http().post(`${base}/report`).set(auth(cg.token)).expect(200)).body as VisitTask) : null;
      return { cg, owner, order, v };
    };

    it('the owner reads photos, checklist, note and times; from the message link too (R39-1, R39-2)', async () => {
      const { owner, order, v } = await sent();
      const r = (await http().get(`/api/orders/${order.id}/visits/0/report`).set(auth(owner.token)).expect(200)).body as VisitReport;
      expect(r).toEqual({
        orderId: order.id,
        number: order.number,
        index: 0,
        date: v!.date,
        start: v!.start,
        caregiver: 'Siti A.',
        reportedAt: v!.reportedAt,
        photos: v!.photos,
        checklist: [{ item: 'feed', done: true }, { item: 'water', done: true }, { item: 'litter', done: true }, { item: 'walk', done: false }],
        note: 'No litter box, owner uses pads',
        status: 'report_sent',
        confirmedAt: null,
        confirmedBy: null,
      });
      const img = await http().get(`/api/orders/${order.id}/visits/0/photos/${r.photos[0]}`).set(auth(owner.token)).expect(200);
      expect(img.headers['content-type']).toBe('image/jpeg');
      expect(img.headers['cache-control']).toBe('private, no-store');

      // The message opens the report.
      const m = (await db().query("SELECT id, link_id FROM messages WHERE user_id = $1 AND link_type = 'report'", [owner.id])).rows[0];
      expect((await http().get(`/api/reports/${m.link_id}`).set(auth(owner.token)).expect(200)).body).toEqual(r);
      const opened = (await http().post(`/api/messages/${m.id}/open`).set(auth(owner.token)).expect(200)).body;
      expect(opened.latest).toMatchObject({ type: 'report', id: Number(m.link_id), status: 'report_sent', summary: `Order ${order.number}: report for visit 1`, gone: false });
    });

    it('not before it is sent, and only for the order\'s owner (R39-3, R39-4)', async () => {
      const { cg, owner, order } = await sent(false);
      expect((await http().get(`/api/orders/${order.id}/visits/0/report`).set(auth(owner.token)).expect(409)).body.code).toBe('REPORT_NOT_READY');
      const photo = (await db().query('SELECT id FROM visit_photos WHERE order_id = $1 LIMIT 1', [order.id])).rows[0].id;
      await http().get(`/api/orders/${order.id}/visits/0/photos/${photo}`).set(auth(owner.token)).expect(409);
      await http().post(`/api/caregiver/tasks/${order.id}/0/report`).set(auth(cg.token)).expect(200);

      const stranger = await login();
      await http().get(`/api/orders/${order.id}/visits/0/report`).set(auth(stranger.token)).expect(404);
      await http().get(`/api/orders/${order.id}/visits/0/photos/${photo}`).set(auth(stranger.token)).expect(404);
      const runId = (await db().query('SELECT id FROM visit_runs WHERE order_id = $1 AND idx = 0', [order.id])).rows[0].id;
      await http().get(`/api/reports/${runId}`).set(auth(stranger.token)).expect(404);
      await http().get('/api/reports/999999999').set(auth(owner.token)).expect(404);
      await http().get(`/api/orders/${order.id}/visits/5/report`).set(auth(owner.token)).expect(404);
      await http().get(`/api/orders/${order.id}/visits/0/photos/999999999`).set(auth(owner.token)).expect(404);
      await http().get(`/api/orders/${order.id}/visits/0/report`).expect(401);
    });
  });

  describe('E9-2 confirm or raise a problem', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const sent = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      const base = `/api/caregiver/tasks/${order.id}/0`;
      await http().post(`${base}/arrive`).set(auth(cg.token)).expect(200);
      await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter', 'walk']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      await http().post(`${base}/report`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, visit: `/api/orders/${order.id}/visits/0` };
    };
    const titles = async (userId: number) => (await db().query('SELECT title, body, link_type FROM messages WHERE user_id = $1 ORDER BY id', [userId])).rows;

    it('the owner confirms once; both sides see Confirmed and the caregiver is told (R40-1)', async () => {
      const { cg, owner, order, visit } = await sent();
      const r = (await http().post(`${visit}/confirm`).set(auth(owner.token)).expect(200)).body as VisitReport;
      expect(r).toMatchObject({ status: 'confirmed', confirmedBy: 'owner' });
      expect(Date.now() - klInstant(r.confirmedAt!).getTime()).toBeLessThan(60_000);
      expect((await http().post(`${visit}/confirm`).set(auth(owner.token)).expect(409)).body.code).toBe('ALREADY_CONFIRMED');
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'Too late').expect(409)).body.code).toBe('ALREADY_CONFIRMED');
      const t = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(t).toMatchObject({ status: 'confirmed', confirmedBy: 'owner' });
      const m = (await titles(cg.id)).find((x) => x.title === 'Visit 1 confirmed');
      expect(m.body).toMatch(new RegExp(`^Order ${order.number}: the report for .+ was confirmed by the owner\\.$`));
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0].status).toBe('confirmed');
      const stranger = await login();
      await http().post(`${visit}/confirm`).set(auth(stranger.token)).expect(404);
    });

    it('12 h with no answer confirms by itself, once (R40-2)', async () => {
      const { cg, owner, order, visit } = await sent();
      const svc = app.get(CasesService);
      await svc.autoConfirmDue();
      expect(((await http().get(`${visit}/report`).set(auth(owner.token)).expect(200)).body as VisitReport).status).toBe('report_sent');
      await db().query("UPDATE visit_runs SET reported_at = now() - interval '12 hours 1 minute' WHERE order_id = $1", [order.id]);
      expect(await svc.autoConfirmDue()).toBeGreaterThanOrEqual(1);
      expect(await svc.autoConfirmDue()).toBe(0);
      expect((await http().get(`${visit}/report`).set(auth(owner.token)).expect(200)).body).toMatchObject({ status: 'confirmed', confirmedBy: 'auto' });
      expect((await titles(cg.id)).filter((x) => x.title === 'Visit 1 confirmed')).toHaveLength(1);
      const h = await db().query("SELECT actor_type, reason FROM status_history WHERE entity = 'visit' AND entity_id = $1 AND to_status = 'confirmed'", [order.id]);
      expect(h.rows).toEqual([{ actor_type: 'system', reason: 'Visit 1 confirmed automatically after 12 h' }]);
      // The test tool does the same for one visit.
      const other = await sent();
      expect((await http().post('/api/dev/report-due').send({ number: other.order.number, index: 0 }).expect(200)).body.confirmed).toBeGreaterThanOrEqual(1);
      expect(((await http().get(`${other.visit}/report`).set(auth(other.owner.token)).expect(200)).body as VisitReport).status).toBe('confirmed');
      await http().post('/api/dev/report-due').send({ number: other.order.number, index: 0 }).expect(404);
    });

    it('a problem makes a case, stops the clock, and admin can start the review (R40-3 … R40-6)', async () => {
      const { cg, owner, order, visit } = await sent();
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'report').field('description', ' ').expect(400)).body).toMatchObject({ code: 'CASE_INVALID', message: 'Describe the problem' });
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'x').field('description', 'Hi').expect(400)).body.message).toBe('Choose what went wrong');
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'report').field('description', 'Hi').attach('photos', Buffer.from('nope'), 'a.txt').expect(400)).body.code).toBe('PHOTO_TYPE');
      await http().get(`${visit}/case`).set(auth(owner.token)).expect(404);

      const c = (await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'report').field('description', 'Litter not cleaned')
        .attach('photos', JPEG, 'a.jpg').attach('photos', JPEG, 'b.jpg').expect(200)).body as VisitCase;
      expect(c).toMatchObject({ orderId: order.id, number: order.number, index: 0, kind: 'report', description: 'Litter not cleaned', status: 'sent', reviewingAt: null });
      expect(c.photos).toHaveLength(2);
      expect((await http().get(`${visit}/case`).set(auth(owner.token)).expect(200)).body).toEqual(c);
      const img = await http().get(`${visit}/case/photos/${c.photos[0]}`).set(auth(owner.token)).expect(200);
      expect(img.headers['content-type']).toBe('image/jpeg');
      expect((await http().get(`${visit}/report`).set(auth(owner.token)).expect(200)).body.status).toBe('disputed');
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask).status).toBe('disputed');
      // One case per visit; no confirm, and the 12 h clock no longer applies.
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'Again').expect(409)).body.code).toBe('CASE_OPEN');
      expect((await http().post(`${visit}/confirm`).set(auth(owner.token)).expect(409)).body.code).toBe('CASE_OPEN');
      await db().query("UPDATE visit_runs SET reported_at = now() - interval '13 hours' WHERE order_id = $1", [order.id]);
      await app.get(CasesService).autoConfirmDue();
      expect((await http().get(`${visit}/report`).set(auth(owner.token)).expect(200)).body.status).toBe('disputed');
      const cgMsg = (await titles(cg.id)).find((x) => x.title === 'Problem raised on visit 1');
      expect(cgMsg.body).toMatch(/the owner raised a problem \(Report problem\) about .+\. Our team will review it and may contact you\.$/);

      // Others cannot see it.
      const stranger = await login();
      await http().get(`${visit}/case`).set(auth(stranger.token)).expect(404);
      await http().get(`${visit}/case/photos/${c.photos[0]}`).set(auth(stranger.token)).expect(404);

      // Admin list and review.
      const admin = await adminLogin(app, ['cases']);
      const rows = (await http().get('/api/admin/cases').set(admin.header).expect(200)).body as AdminCaseRow[];
      expect(rows.find((x) => x.id === c.id)).toMatchObject({ number: order.number, visit: 1, kind: 'report', photos: 2, status: 'sent', payoutHeld: true });
      await http().post(`/api/admin/cases/${c.id}/review`).set(admin.header).expect(200);
      expect((await http().post(`/api/admin/cases/${c.id}/review`).set(admin.header).expect(409)).body.code).toBe('CASE_NOT_NEW');
      const after = (await http().get(`${visit}/case`).set(auth(owner.token)).expect(200)).body as VisitCase;
      expect(after.status).toBe('reviewing');
      expect(after.reviewingAt).not.toBeNull();
      expect((await titles(owner.id)).find((x) => x.title === 'We are reviewing visit 1')).toMatchObject({ link_type: 'report' });
      const noPage = await adminLogin(app, ['payments']);
      await http().get('/api/admin/cases').set(noPage.header).expect(403);
    });
  });

  describe('E9-3 rate the caregiver', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    /** Both visits done and reported; `confirm` lists the visits the owner confirms. */
    const done = async (confirm: number[] = [0, 1]) => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      for (const i of [0, 1]) {
        await http().post('/api/dev/visit-soon').send({ number: order.number, index: i }).expect(200);
        const base = `/api/caregiver/tasks/${order.id}/${i}`;
        await http().post(`${base}/arrive`).set(auth(cg.token)).expect(200);
        await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
        for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
        for (const item of ['feed', 'water', 'litter', 'walk']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
        await http().post(`${base}/report`).set(auth(cg.token)).expect(200);
      }
      for (const i of confirm) await http().post(`/api/orders/${order.id}/visits/${i}/confirm`).set(auth(owner.token)).expect(200);
      return { cg, owner, order };
    };
    const review = async (token: string, id: number) => ((await http().get(`/api/orders/${id}/detail`).set(auth(token)).expect(200)).body as OrderDetail).review;

    it('opens only when every visit is confirmed; 1 to 5 stars, once; the caregiver is told (R41-1, R41-2)', async () => {
      const { cg, owner, order } = await done([0]);
      expect(await review(owner.token, order.id)).toEqual({ state: 'not_yet', until: null, mine: null });
      expect((await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 5 }).expect(409)).body.code).toBe('NOT_CONFIRMED');
      await http().post(`/api/orders/${order.id}/visits/1/confirm`).set(auth(owner.token)).expect(200);
      const open = await review(owner.token, order.id);
      expect(open.state).toBe('open');
      expect(klInstant(open.until!).getTime() - Date.now()).toBeGreaterThan(13.9 * 86_400_000);

      expect((await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 0 }).expect(400)).body).toMatchObject({ code: 'REVIEW_INVALID', message: 'Tap 1 to 5 stars' });
      expect((await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 4, comment: 'x'.repeat(301) }).expect(400)).body.code).toBe('REVIEW_INVALID');
      const stranger = await login();
      await http().post(`/api/orders/${order.id}/review`).set(auth(stranger.token)).send({ stars: 5 }).expect(404);

      const r = (await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 4, comment: '  Kind and on time  ' }).expect(200)).body as OrderReview;
      expect(r).toMatchObject({ state: 'done', mine: { stars: 4, comment: 'Kind and on time', ownerName: 'Ali', reply: null } });
      expect((await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 5 }).expect(409)).body.code).toBe('ALREADY_REVIEWED');
      expect(await review(owner.token, order.id)).toEqual(r);
      const m = (await db().query('SELECT title, body, link_type FROM messages WHERE user_id = $1 AND title = $2', [cg.id, `New review for order ${order.number}`])).rows[0];
      expect(m).toMatchObject({ body: `Ali gave you 4 stars for order ${order.number}. You can reply once.`, link_type: 'request' });
    });

    it('closes 14 days after the last confirm (R41-3)', async () => {
      const { owner, order } = await done();
      await db().query("UPDATE visit_runs SET confirmed_at = now() - interval '14 days 1 minute' WHERE order_id = $1", [order.id]);
      expect((await review(owner.token, order.id)).state).toBe('closed');
      expect((await http().post(`/api/orders/${order.id}/review`).set(auth(owner.token)).send({ stars: 5 }).expect(409)).body.code).toBe('REVIEW_CLOSED');
    });

    it('the profile shows the average and the newest 5; the caregiver replies once; admin hides with a reason (R41-4 … R41-6)', async () => {
      const first = await done();
      const cg = first.cg;
      const owner = await login();
      expect((await http().get(`/api/caregivers/${cg.id}/reviews`).set(auth(owner.token)).expect(200)).body).toEqual({ rating: { avg: null, count: 0 }, reviews: [] });
      expect((await app.get(TrustService).approvedCards([cg.id]))[0].rating).toEqual({ avg: null, count: 0 });
      await http().post(`/api/orders/${first.order.id}/review`).set(auth(first.owner.token)).send({ stars: 5, comment: 'Great' }).expect(200);
      // More orders for the same caregiver, rated straight in the table.
      for (const stars of [4, 4, 3, 5, 4]) {
        const { order } = await paidOrder(cg);
        await db().query("INSERT INTO reviews (order_id, owner_id, caregiver_id, stars, comment, owner_name) SELECT id, owner_id, caregiver_id, $2, '', 'Mei L.' FROM orders WHERE id = $1", [order.id, stars]);
      }
      const page = (await http().get(`/api/caregivers/${cg.id}/reviews`).set(auth(owner.token)).expect(200)).body as CaregiverReviews;
      expect(page.rating).toEqual({ avg: 4.2, count: 6 });
      expect(page.reviews.map((x) => x.stars)).toEqual([4, 5, 3, 4, 4]);
      expect((await app.get(TrustService).approvedCards([cg.id]))[0].rating).toEqual({ avg: 4.2, count: 6 });

      // Reply once (S07).
      const base = `/api/requests/${first.order.id}/review`;
      expect(((await http().get(base).set(auth(cg.token)).expect(200)).body as { review: Review }).review).toMatchObject({ stars: 5, comment: 'Great', reply: null });
      expect((await http().post(`${base}/reply`).set(auth(cg.token)).send({ reply: ' ' }).expect(400)).body.code).toBe('REPLY_INVALID');
      const replied = (await http().post(`${base}/reply`).set(auth(cg.token)).send({ reply: 'Thank you!' }).expect(200)).body as { review: Review };
      expect(replied.review).toMatchObject({ reply: 'Thank you!' });
      expect(replied.review.repliedAt).not.toBeNull();
      expect((await http().post(`${base}/reply`).set(auth(cg.token)).send({ reply: 'Again' }).expect(409)).body.code).toBe('ALREADY_REPLIED');
      expect((await review(first.owner.token, first.order.id)).mine).toMatchObject({ reply: 'Thank you!' });
      expect((await db().query('SELECT body FROM messages WHERE user_id = $1 AND title = $2', [first.owner.id, 'Your caregiver replied'])).rows[0].body).toBe(`Order ${first.order.number}: the caregiver replied to your review.`);
      const other = await caregiver();
      await http().get(base).set(auth(other.token)).expect(404);

      // Admin hides it.
      const admin = await adminLogin(app, ['reviews']);
      const rows = (await http().get('/api/admin/reviews').set(admin.header).expect(200)).body as AdminReviewRow[];
      const id = page.reviews.find((x) => x.stars === 3)!.id;
      expect(rows.find((x) => x.id === id)).toMatchObject({ stars: 3, caregiver: 'Siti Aminah', hidden: false, hiddenReason: null });
      expect((await http().post(`/api/admin/reviews/${id}/hide`).set(admin.header).send({ reason: ' ' }).expect(400)).body.code).toBe('REASON_REQUIRED');
      const after = (await http().post(`/api/admin/reviews/${id}/hide`).set(admin.header).send({ reason: 'Rude words' }).expect(200)).body as AdminReviewRow[];
      expect(after.find((x) => x.id === id)).toMatchObject({ hidden: true, hiddenReason: 'Rude words' });
      expect((await http().post(`/api/admin/reviews/${id}/hide`).set(admin.header).send({ reason: 'Again' }).expect(409)).body.code).toBe('ALREADY_HIDDEN');
      const now = (await http().get(`/api/caregivers/${cg.id}/reviews`).set(auth(owner.token)).expect(200)).body as CaregiverReviews;
      expect(now.rating).toEqual({ avg: 4.4, count: 5 });
      expect(now.reviews.map((x) => x.id)).not.toContain(id);
      const noPage = await adminLogin(app, ['cases']);
      await http().get('/api/admin/reviews').set(noPage.header).expect(403);
    });
  });

  describe('E10-1 cancel visits', () => {
    const booked = async (owner?: Awaited<ReturnType<typeof login>>) => {
      const cg = await caregiver();
      const { owner: o, order, paymentId } = await paidOrder(cg, owner);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(o.token)).expect(200)).body as OrderDetail;
      return { cg, owner: o, order, d, base: `/api/orders/${order.id}/cancel` };
    };
    const asUser = (u: { id: number }) => ({ id: u.id }) as User;

    it('previews and cancels one visit at 100%; the caregiver is told and the time is free (R42-1, R42-3, R42-5)', async () => {
      const { cg, owner, order, d, base } = await booked();
      const p = (await http().get(base).set(auth(owner.token)).expect(200)).body as CancelPreview;
      expect(p.lines.map((l) => [l.percent, l.refundSen, l.blocked])).toEqual([[100, d.visits[0].paidSen, null], [100, d.visits[1].paidSen, null]]);
      expect((await http().post(base).set(auth(owner.token)).send({ visits: [], percents: [] }).expect(400)).body.code).toBe('CANCEL_INVALID');
      expect((await http().post(base).set(auth(owner.token)).send({ visits: [0], percents: [80] }).expect(409)).body).toMatchObject({ code: 'AMOUNT_CHANGED', preview: { lines: p.lines } });

      const r = (await http().post(base).set(auth(owner.token)).send({ visits: [0], percents: [100] }).expect(200)).body as CancelResult;
      expect(r).toEqual({ cancelled: [{ index: 0, percent: 100, refundSen: d.visits[0].paidSen, creditSen: 0, refund: 'started' }], failed: [], refundSen: d.visits[0].paidSen, creditSen: 0, orderCancelled: false });
      expect((await http().post(base).set(auth(owner.token)).send({ visits: [0], percents: [100] }).expect(200)).body).toEqual({ cancelled: [], failed: [{ index: 0, reason: 'Not cancelled: it was already cancelled' }], refundSen: 0, creditSen: 0, orderCancelled: false });

      const after = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(after.status).toBe('accepted');
      expect(after.runs[0]).toMatchObject({ status: 'cancelled', cancel: { percent: 100, refundSen: d.visits[0].paidSen, creditSen: 0 } });
      expect(after.refundSen).toBe(d.visits[0].paidSen);
      const pay = await db().query('SELECT amount_sen FROM payments WHERE ref = $1', [`order-${order.id}-refund-v0`]);
      expect(pay.rows).toEqual([{ amount_sen: d.visits[0].paidSen }]);
      const slots = await db().query('SELECT visit_date FROM booked_visits WHERE order_id = $1', [order.id]);
      expect(slots.rows).toHaveLength(1);
      const m = (await db().query('SELECT title, body, link_type FROM messages WHERE user_id = $1 AND title = $2', [cg.id, 'Visit 1 cancelled'])).rows[0];
      expect(m).toMatchObject({ link_type: 'request' });
      expect(m.body).toMatch(new RegExp(`^Order ${order.number}: the owner cancelled .+\\. It is no longer in your tasks\\.$`));
      expect((await db().query('SELECT body FROM messages WHERE user_id = $1 AND title LIKE $2', [owner.id, 'Refund:%'])).rows[0].body).toMatch(/you cancelled visit 1\. RM[\d.]+ back to how you paid\.$/);
      const t = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(t.status).toBe('cancelled');
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 });
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(409)).body.message).toBe('This visit was cancelled');

      const stranger = await login();
      await http().get(base).set(auth(stranger.token)).expect(404);
    });

    it('80% between 1 and 24 h, 0% under 1 h; a line passing asks again (R42-3, R42-4)', async () => {
      const { owner, order, d } = await booked();
      const svc = app.get(CancelService);
      const start = (i: number) => visitTime(d.visits[i]).getTime();
      const p = await svc.preview(asUser(owner), order.id, new Date(start(0) - 2 * 3600_000));
      expect(p.lines[0]).toMatchObject({ percent: 80, refundSen: Math.round(d.visits[0].paidSen * 0.8) });
      // Seen at 80% but submitted under 1 h before: nothing is cancelled.
      await expect(svc.cancel(asUser(owner), order.id, { visits: [0], percents: [80] }, new Date(start(0) - 59 * 60_000))).rejects.toMatchObject({ response: { code: 'AMOUNT_CHANGED' } });
      const r = await svc.cancel(asUser(owner), order.id, { visits: [0], percents: [0] }, new Date(start(0) - 59 * 60_000));
      expect(r).toMatchObject({ refundSen: 0, cancelled: [{ index: 0, percent: 0 }] });
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [`order-${order.id}-refund-v0`])).rows).toHaveLength(0);
      // Once its time has come, it cannot be cancelled.
      expect(await svc.cancel(asUser(owner), order.id, { visits: [1], percents: [100] }, new Date(start(1)))).toMatchObject({ cancelled: [], failed: [{ index: 1, reason: 'Not cancelled: its time has started' }] });
    });

    it('cancelling every visit cancels the order; credit comes back as credit (R42-3, R42-6)', async () => {
      const o = await login();
      await http().post('/api/addresses').set(auth(o.token)).send(address).expect(201);
      await db().query("INSERT INTO credit_grants (owner_id, amount_sen, remaining_sen, expires_on, reason) VALUES ($1, 1000, 1000, CURRENT_DATE + 30, 'test')", [o.id]);
      const { cg, owner, order, d, base } = await booked(o);
      expect(d.creditSen).toBe(1000);
      const paid = d.visits[0].paidSen + d.visits[1].paidSen;
      const r = (await http().post(base).set(auth(owner.token)).send({ visits: [1, 0], percents: [100, 100] }).expect(200)).body as CancelResult;
      expect(r).toMatchObject({ refundSen: paid, creditSen: 1000, orderCancelled: true });
      const after = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(after).toMatchObject({ status: 'cancelled', endReason: 'cancelled', refundSen: paid - 1000 });
      expect((await db().query('SELECT COALESCE(SUM(remaining_sen), 0)::int AS sen FROM credit_grants WHERE owner_id = $1', [owner.id])).rows[0].sen).toBe(1000);
      expect((await db().query('SELECT title FROM messages WHERE user_id = $1 AND title = $2', [after.caregiver.id, '2 visits cancelled'])).rows).toHaveLength(1);
      // The caregiver still sees them, as Cancelled.
      const cgUser = (await db().query('SELECT caregiver_id FROM orders WHERE id = $1', [order.id])).rows[0].caregiver_id;
      expect(cgUser).toBe(after.caregiver.id);
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/1`).set(auth(cg.token)).expect(200)).body as VisitTask).status).toBe('cancelled');
      expect(((await http().get(`/api/requests/${order.id}`).set(auth(cg.token)).expect(200)).body as RequestDetail).end).toBe('accepted');
      expect((await http().get(base).set(auth(owner.token)).expect(409)).body.code).toBe('ORDER_NOT_BOOKED');
    });

    it('only booked orders: a waiting order uses Withdraw (R42-1)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      expect((await http().get(`/api/orders/${order.id}/cancel`).set(auth(owner.token)).expect(409)).body.code).toBe('ORDER_NOT_BOOKED');
    });
  });

  describe('E10-2 per-visit results', () => {
    const booked = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      return { cg, owner, order, d, base: `/api/orders/${order.id}/cancel` };
    };

    it('visits that can be cancelled go ahead; the others say why; messages list only the cancelled (R43-1, R43-2, R43-5)', async () => {
      const { cg, owner, order, d, base } = await booked();
      // Visit 1: the caregiver has arrived.
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      const r = (await http().post(base).set(auth(owner.token)).send({ visits: [1, 0], percents: [100, 0] }).expect(200)).body as CancelResult;
      expect(r).toEqual({
        cancelled: [{ index: 1, percent: 100, refundSen: d.visits[1].paidSen, creditSen: 0, refund: 'started' }],
        failed: [{ index: 0, reason: 'Not cancelled: the caregiver has already arrived' }],
        refundSen: d.visits[1].paidSen,
        creditSen: 0,
        orderCancelled: false,
      });
      const after = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(after.runs.map((x) => x.status)).toEqual(['arrived', 'cancelled']);
      const msgs = (await db().query("SELECT title FROM messages WHERE user_id = $1 AND title LIKE '%cancelled'", [cg.id])).rows;
      expect(msgs).toEqual([{ title: 'Visit 2 cancelled' }]);
    });

    it('a refund that cannot start leaves the visit cancelled and is retried (R43-4)', async () => {
      const { owner, order, d, base } = await booked();
      const chargeId = (await db().query('SELECT charge_id FROM orders WHERE id = $1', [order.id])).rows[0].charge_id;
      await db().query('UPDATE orders SET charge_id = NULL WHERE id = $1', [order.id]);
      const r = (await http().post(base).set(auth(owner.token)).send({ visits: [0], percents: [100] }).expect(200)).body as CancelResult;
      expect(r.cancelled).toEqual([{ index: 0, percent: 100, refundSen: d.visits[0].paidSen, creditSen: 0, refund: 'processing' }]);
      expect(((await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail).runs[0].status).toBe('cancelled');
      const ref = `order-${order.id}-refund-v0`;
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [ref])).rows).toHaveLength(0);
      await db().query('UPDATE orders SET charge_id = $2 WHERE id = $1', [order.id, chargeId]);
      expect(await app.get(CancelService).retryRefunds()).toBeGreaterThanOrEqual(1);
      expect((await db().query('SELECT amount_sen FROM payments WHERE ref = $1', [ref])).rows).toEqual([{ amount_sen: d.visits[0].paidSen }]);
      // Once started, never again.
      await app.get(CancelService).retryRefunds();
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [ref])).rows).toHaveLength(1);
    });
  });

  describe('E10-3 track refunds', () => {
    const fail = (paymentId: number) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: 'failure' }).expect(200);
    const payId = async (ref: string) => Number((await db().query('SELECT id FROM payments WHERE ref = $1', [ref])).rows[0].id);
    const later = (min: number) => new Date(Date.now() + min * 60_000);
    const booked = async (owner?: Awaited<ReturnType<typeof login>>) => {
      const cg = await caregiver();
      const { owner: o, order, paymentId } = await paidOrder(cg, owner);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(o.token)).expect(200)).body as OrderDetail;
      return { cg, owner: o, order, d };
    };

    it('a cancelled visit refund: on its way, being processed after a failure, retried, then refunded and the owner told (R44-2 … R44-5)', async () => {
      const { owner, order, d } = await booked();
      await http().post(`/api/orders/${order.id}/cancel`).set(auth(owner.token)).send({ visits: [0], percents: [100] }).expect(200);
      const get = async () => (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      const sen = d.visits[0].paidSen;
      expect(await get()).toEqual({
        orderId: order.id,
        number: order.number,
        dueSen: sen,
        refundedSen: 0,
        onItsWaySen: sen,
        creditBackSen: 0,
        lines: [{ key: 'v0', reason: 'Visit 1 cancelled', amountSen: sen, state: 'on_its_way', doneAt: null }],
      });

      const ref = `order-${order.id}-refund-v0`;
      await fail(await payId(ref));
      expect((await get()).lines[0].state).toBe('processing');
      // O13 still shows the money as due.
      expect(((await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail).refundSen).toBe(sen);
      // A few minutes apart: not at once.
      const svc = app.get(RefundsService);
      await svc.retryFailed(new Date());
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [`${ref}-r1`])).rows).toHaveLength(0);
      expect(await svc.retryFailed(later(4))).toBeGreaterThanOrEqual(1);
      expect((await get()).lines[0].state).toBe('on_its_way');

      await succeed(await payId(`${ref}-r1`));
      const done = await get();
      expect(done).toMatchObject({ dueSen: sen, refundedSen: sen, onItsWaySen: 0 });
      expect(done.lines[0]).toMatchObject({ state: 'refunded', doneAt: expect.stringMatching(/^\d{4}-\d\d-\d\d /) });
      const money = `RM${sen / 100}`;
      expect((await db().query("SELECT title, body, link_type FROM messages WHERE user_id = $1 AND title LIKE 'Refund received%'", [owner.id])).rows).toEqual([
        { title: `Refund received: ${money}`, body: `Order ${order.number}: ${money} (Visit 1 cancelled) is back to how you paid.`, link_type: 'order' },
      ]);
      // Never sent again once refunded.
      await svc.retryFailed(later(10));
      expect((await db().query("SELECT COUNT(*)::int AS n FROM payments WHERE ref LIKE $1 AND status <> 'failed'", [`${ref}%`])).rows[0].n).toBe(1);

      const stranger = await login();
      await http().get(`/api/orders/${order.id}/refunds`).set(auth(stranger.token)).expect(404);
    });

    it('after 3 failed retries the admin sees it on Money and can send it again (R44-4, R56-3)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200);
      const base = `order-${order.id}-refund-${paymentId}`;
      const svc = app.get(RefundsService);
      const refs = [base, `${base}-r1`, `${base}-r2`, `${base}-r3`];
      for (const [i, ref] of refs.entries()) {
        if (i) await svc.retryFailed(later(4 * i));
        await fail(await payId(ref));
      }
      await svc.retryFailed(later(30));
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [`${base}-r4`])).rows).toHaveLength(0);
      const r = (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      expect(r.lines).toEqual([{ key: `full-${paymentId}`, reason: 'Withdrawn', amountSen: order.paySen, state: 'processing', doneAt: null }]);

      // E13-4: it is on the Money page, failed, and can be sent again once.
      const admin = await adminLogin(app, ['money']);
      const list = (await http().get('/api/admin/money').set(admin.header).expect(200)).body as MoneyItem[];
      expect(list.find((x) => x.id === base)).toMatchObject({ kind: 'refund', number: order.number, what: 'Withdrawn', amountSen: order.paySen, state: 'failed', tries: 4, lastFailure: 'Declined by bank (mock)' });
      const noPage = await adminLogin(app, ['cases']);
      await http().get('/api/admin/money').set(noPage.header).expect(403);
      const after = (await http().post(`/api/admin/money/${base}/send-again`).set(admin.header).expect(200)).body as MoneyDetail;
      expect(after).toMatchObject({ state: 'processing', tries: 5 });
      expect((await http().post(`/api/admin/money/${base}/send-again`).set(admin.header).expect(409)).body.code).toBe('NOT_FAILED');
      expect((await http().post(`/api/admin/money/order-${order.id}-refund-v9/send-again`).set(admin.header).expect(404)).body.code).toBe('MONEY_NOT_FOUND');
      await succeed(await payId(`${base}-r4`));
      expect(((await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds).lines[0].state).toBe('refunded');
    });

    it('credit back is shown apart from money; a refund not started yet is being processed (R44-2, R43-4)', async () => {
      const o = await login();
      await http().post('/api/addresses').set(auth(o.token)).send(address).expect(201);
      await db().query("INSERT INTO credit_grants (owner_id, amount_sen, remaining_sen, expires_on, reason) VALUES ($1, 1000, 1000, CURRENT_DATE + 30, 'test')", [o.id]);
      const { owner, order, d } = await booked(o);
      await db().query('UPDATE orders SET charge_id = NULL WHERE id = $1', [order.id]);
      await http().post(`/api/orders/${order.id}/cancel`).set(auth(owner.token)).send({ visits: [0, 1], percents: [100, 100] }).expect(200);
      const r = (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      const paid = d.visits[0].paidSen + d.visits[1].paidSen;
      expect(r).toMatchObject({ dueSen: paid - 1000, refundedSen: 0, onItsWaySen: paid - 1000, creditBackSen: 1000 });
      expect(r.lines.map((l) => [l.key, l.reason, l.state])).toEqual([
        ['v0', 'Visit 1 cancelled', 'processing'],
        ['v1', 'Visit 2 cancelled', 'processing'],
      ]);
    });
  });

  describe('E11-1 request waiting', () => {
    const ready = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      return { cg, owner, order, wait: () => http().post(`/api/caregiver/tasks/${order.id}/0/wait`).set(auth(cg.token)) };
    };

    it('only after arriving and once; recorded, the owner told the rule; entry stops it (R45-1, R45-2, R45-5)', async () => {
      const { cg, owner, order, wait } = await ready();
      expect((await wait().expect(409)).body).toMatchObject({ code: 'CANNOT_WAIT', message: 'Tap "I\'ve arrived" first' });
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      const v = (await wait().expect(200)).body as VisitTask;
      expect(v.status).toBe('arrived');
      expect(Date.now() - klInstant(v.waitingAt!).getTime()).toBeLessThan(60_000);
      expect((await wait().expect(409)).body.message).toBe('Waiting is already requested');
      const m = (await db().query("SELECT title, body, link_type FROM messages WHERE user_id = $1 AND title LIKE '%is waiting for you'", [owner.id])).rows;
      expect(m).toHaveLength(1);
      expect(m[0].link_type).toBe('order');
      expect(m[0].body).toMatch(/is waiting at the door from \d{1,2}:\d\d [ap]m\. First 10 min free, then RM5 per started 10 min, up to 60 min \/ RM25\. Waiting stops when you let them in\.$/);
      expect((await db().query("SELECT reason FROM status_history WHERE entity = 'visit' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [order.id])).rows[0].reason).toBe('Owner asked to wait for visit 1');
      // The owner sees it on the order too.
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0].waitingAt).toBe(v.waitingAt);
      // Let in: the clock stops and no new request.
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      const after = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(after).toMatchObject({ status: 'in_service', waitingAt: v.waitingAt });
      expect(after.enteredAt).not.toBeNull();
    });

    it('not after entry, and only the visit\'s caregiver (R45-1)', async () => {
      const { cg, order, wait } = await ready();
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      await db().query("UPDATE visit_runs SET status = 'in_service', entered_at = now(), entered_by = 'owner' WHERE order_id = $1 AND idx = 0", [order.id]);
      expect((await wait().expect(409)).body.message).toBe('You are already in');
      const other = await caregiver();
      await http().post(`/api/caregiver/tasks/${order.id}/0/wait`).set(auth(other.token)).expect(404);
    });
  });

  describe('E11-2 request overtime', () => {
    const inService = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const moved = (await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200)).body as { date: string; start: number };
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      const base = `/api/caregiver/tasks/${order.id}/0/overtime`;
      return { cg, owner, order, moved, base };
    };

    it('only in service; units up to her limit; the owner is told; one at a time; withdraw (R46-1, R46-2, R46-4, R46-5)', async () => {
      const { cg, owner, order, base } = await inService();
      expect((await http().get(base).set(auth(cg.token)).expect(409)).body.code).toBe('NOT_IN_SERVICE');
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);

      const info = (await http().get(base).set(auth(cg.token)).expect(200)).body as OvertimeInfo;
      expect(info).toMatchObject({ limitMin: 30, bookedMin: 0, open: null });
      expect(info.choices.map((c) => [c.units, c.fits])).toEqual([[1, true], [2, true]]);
      expect(info.choices[0].text).toMatch(/^Fits \(/);
      expect((await http().post(base).set(auth(cg.token)).send({ units: 3 }).expect(409)).body).toMatchObject({ code: 'OVERTIME_TOO_LONG', message: 'You can ask for up to 30 min on this visit' });
      expect((await http().post(base).set(auth(cg.token)).send({ units: 1.5 }).expect(409)).body.code).toBe('OVERTIME_TOO_LONG');

      const asked = (await http().post(base).set(auth(cg.token)).send({ units: 2 }).expect(200)).body as OvertimeInfo;
      expect(asked.open).toMatchObject({ units: 2, amountSen: 2000, status: 'requested' });
      expect((await http().post(base).set(auth(cg.token)).send({ units: 1 }).expect(409)).body.code).toBe('OVERTIME_OPEN');
      const m = (await db().query("SELECT title, body FROM messages WHERE user_id = $1 AND title LIKE 'Overtime%'", [owner.id])).rows;
      expect(m).toEqual([{ title: 'Overtime asked: 30 min · RM20', body: expect.stringMatching(/ asks to stay 30 min longer on the visit at .+\. Until you approve and pay, only the booked service is done\.$/) }]);
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask).overtime).toMatchObject({ units: 2 });

      const back = (await http().post(`${base}/withdraw`).set(auth(cg.token)).expect(200)).body as OvertimeInfo;
      expect(back.open).toBeNull();
      expect((await http().post(`${base}/withdraw`).set(auth(cg.token)).expect(409)).body.code).toBe('NO_OVERTIME');
      expect((await db().query("SELECT title FROM messages WHERE user_id = $1 AND title = 'Overtime request withdrawn'", [owner.id])).rows).toHaveLength(1);
      // Can ask again after withdrawing.
      await http().post(base).set(auth(cg.token)).send({ units: 1 }).expect(200);
      expect((await db().query("SELECT status FROM extra_fees WHERE order_id = $1 ORDER BY id", [order.id])).rows.map((r) => r.status)).toEqual(['withdrawn', 'requested']);
      // Another caregiver cannot see it.
      const other = await caregiver();
      await http().get(base).set(auth(other.token)).expect(404);
    });

    it('the extra time must clear the next visit with the travel buffer (R46-3)', async () => {
      const { cg, owner, order, moved, base } = await inService();
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      const { endMin } = (await http().get(base).set(auth(cg.token)).expect(200)).body as OvertimeInfo;
      // Next visit starts 45 min after the end: with a 30 min buffer only 15 min fits.
      await db().query("INSERT INTO booked_visits (caregiver_id, visit_date, start_min, minutes, label) VALUES ($1, $2, $3, 30, 'Test visit')", [cg.id, moved.date, endMin + 45]);
      const info = (await http().get(base).set(auth(cg.token)).expect(200)).body as OvertimeInfo;
      expect(info.choices.map((c) => c.fits)).toEqual([true, false]);
      expect(info.choices[1].text).toMatch(/^Clashes with your \d{1,2}:\d\d [ap]m visit$/);
      expect((await http().post(base).set(auth(cg.token)).send({ units: 2 }).expect(409)).body).toMatchObject({ code: 'OVERTIME_CLASH', message: info.choices[1].text });
      await http().post(base).set(auth(cg.token)).send({ units: 1 }).expect(200);
    });
  });

  describe('E11-3 approve and pay extra fees', () => {
    const fail = (paymentId: number) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: 'failure' }).expect(200);
    const inService = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, fees: `/api/orders/${order.id}/extra-fees` };
    };

    it('overtime: on the order, a failed payment can be tried again, paid → the caregiver may stay; no withdraw after (R47-1, R47-2, R47-5)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/overtime`).set(auth(cg.token)).send({ units: 2 }).expect(200);
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.extraFees).toHaveLength(1);
      const fee = d.extraFees[0];
      expect(fee).toMatchObject({ kind: 'overtime', units: 2, amountSen: 2000, status: 'requested', index: 0, payment: null });

      expect((await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'cash' }).expect(400)).body.code).toBe('BAD_METHOD');
      const first = (await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number };
      // Pressed twice while the bank checks: the same payment.
      expect(((await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number }).paymentId).toBe(first.paymentId);
      await fail(first.paymentId);
      const again = (await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number };
      expect(again.paymentId).not.toBe(first.paymentId);
      await succeed(again.paymentId);

      const list = (await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[];
      expect(list[0]).toMatchObject({ status: 'paid', payment: { id: again.paymentId, status: 'succeeded' } });
      expect(list[0].paidAt).not.toBeNull();
      const m = (await db().query("SELECT body FROM messages WHERE user_id = $1 AND title = 'Overtime paid: 30 min · RM20'", [cg.id])).rows;
      expect(m[0].body).toMatch(/the owner paid\. You may stay until \d{1,2}:\d\d [ap]m\.$/);
      const t = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(t.overtime).toMatchObject({ status: 'paid', units: 2 });
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/overtime/withdraw`).set(auth(cg.token)).expect(409)).body.code).toBe('OVERTIME_PAID');
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/overtime`).set(auth(cg.token)).send({ units: 1 }).expect(409)).body.code).toBe('OVERTIME_PAID');
      expect((await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(409)).body.code).toBe('FEE_CLOSED');
      const stranger = await login();
      await http().get(fees).set(auth(stranger.token)).expect(404);
    });

    it('overtime: decline tells the caregiver; an unpaid request lapses when the booked time ends (R47-2, R47-4)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      const ask = () => http().post(`/api/caregiver/tasks/${order.id}/0/overtime`).set(auth(cg.token)).send({ units: 1 }).expect(200);
      await ask();
      let fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      expect((await http().post(`${fees}/${fee.id}/decline`).set(auth(owner.token)).expect(200)).body).toMatchObject({ status: 'declined' });
      expect((await db().query("SELECT body FROM messages WHERE user_id = $1 AND title = 'Overtime declined'", [cg.id])).rows[0].body).toBe(`Order ${order.number}: the owner declined 15 min · RM10. Finish the booked service only.`);
      // She may ask again; it lapses once the booked service time has passed.
      await ask();
      fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      await app.get(ExtraFeesService).lapseDue(order.id, new Date(Date.now() + 3 * 3600_000));
      expect(((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0]).toMatchObject({ id: fee.id, status: 'lapsed' });
      expect((await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(409)).body.code).toBe('FEE_CLOSED');
    });

    it('waiting: the owner can prepay RM25, never decline; let in within 10 min → nothing to pay (R47-3)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/caregiver/tasks/${order.id}/0/wait`).set(auth(cg.token)).expect(200);
      const fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      expect(fee).toMatchObject({ kind: 'waiting', amountSen: 2500, status: 'requested', entryMethod: 'live_confirm' });
      expect((await http().post(`${fees}/${fee.id}/decline`).set(auth(owner.token)).expect(409)).body.code).toBe('CANNOT_DECLINE');
      // Let in before the booked start: free.
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      expect(((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0]).toMatchObject({ status: 'not_needed' });
      expect(((await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail).extraFees).toEqual([]);
    });

    it('waiting prepaid: the caregiver is told; paid after the request closed → refunded in full (R47-3, R47-5)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/caregiver/tasks/${order.id}/0/wait`).set(auth(cg.token)).expect(200);
      const fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      const { paymentId } = (await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'duitnow' }).expect(200)).body as { paymentId: number };
      await succeed(paymentId);
      expect((await db().query("SELECT title FROM messages WHERE user_id = $1 AND title = 'Waiting prepaid'", [cg.id])).rows).toHaveLength(1);

      // A second visit's request closes while the payment is still open.
      const other = await inService();
      await http().post(`/api/caregiver/tasks/${other.order.id}/0/wait`).set(auth(other.cg.token)).expect(200);
      const f2 = ((await http().get(other.fees).set(auth(other.owner.token)).expect(200)).body as ExtraFee[])[0];
      const p2 = (await http().post(`${other.fees}/${f2.id}/pay`).set(auth(other.owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number };
      await db().query("UPDATE extra_fees SET status = 'not_needed' WHERE id = $1", [f2.id]);
      await succeed(p2.paymentId);
      expect((await db().query('SELECT amount_sen FROM payments WHERE ref = $1', [`fee-${f2.id}-refund-${p2.paymentId}`])).rows).toEqual([{ amount_sen: 2500 }]);
      void owner;
    });
  });

  describe('E11-4 refund unused extra fees', () => {
    const nowMin = () => Math.floor(((Date.now() + 8 * 3_600_000) % 86_400_000) / 60_000);
    const inService = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, fees: `/api/orders/${order.id}/extra-fees` };
    };
    /** The booked start was `ago` minutes ago and the caregiver arrived before it. */
    const startedAgo = async (orderId: number, ago: number) => {
      await db().query("UPDATE orders SET visits = jsonb_set(visits::jsonb, '{0,start}', to_jsonb($2::int))::json WHERE id = $1", [orderId, nowMin() - ago]);
      await db().query("UPDATE visit_runs SET arrived_at = now() - make_interval(mins => $2::int) WHERE order_id = $1 AND idx = 0", [orderId, ago + 5]);
    };

    it('waiting: let in after 25 min → RM10 used, RM15 back on O16; unpaid → owes only what was used (R48-1, R48-3)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/caregiver/tasks/${order.id}/0/wait`).set(auth(cg.token)).expect(200);
      const fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      const { paymentId } = (await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number };
      await succeed(paymentId);
      await startedAgo(order.id, 25);
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);

      const after = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      expect(after).toMatchObject({ status: 'paid', amountSen: 2500, used: { minutes: 25, sen: 1000, refundSen: 1500, refund: 'on_its_way' } });
      const ref = `order-${order.id}-refund-w${fee.id}`;
      const back = (await db().query('SELECT id, amount_sen, parent_id FROM payments WHERE ref = $1', [ref])).rows;
      expect(back).toEqual([{ id: expect.anything(), amount_sen: 1500, parent_id: expect.anything() }]);
      expect(Number(back[0].parent_id)).toBe(paymentId);
      const o16 = (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      expect(o16.lines.find((l) => l.key === `w${fee.id}`)).toMatchObject({ reason: 'Waiting: unused prepay', amountSen: 1500, state: 'on_its_way' });

      await succeed(Number(back[0].id));
      expect(((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0].used).toMatchObject({ refund: 'refunded' });
      expect((await db().query("SELECT body FROM messages WHERE user_id = $1 AND title = 'Refund received: RM15'", [owner.id])).rows[0].body).toContain('Waiting: unused prepay');
      // Sent once only.
      await http().post(`/api/caregiver/tasks/${order.id}/0/enter`).set(auth(cg.token)).expect(409);
      expect((await db().query('SELECT 1 FROM payments WHERE ref LIKE $1', [`${ref}%`])).rowCount).toBe(1);
      const t = (await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(t.waitingAt).not.toBeNull();

      // Not paid before the let in: the request now asks only for what was used.
      const other = await inService();
      await http().post(`/api/caregiver/tasks/${other.order.id}/0/wait`).set(auth(other.cg.token)).expect(200);
      await startedAgo(other.order.id, 25);
      await http().post(`/api/orders/${other.order.id}/visits/0/confirm-entry`).set(auth(other.owner.token)).expect(200);
      const owed = ((await http().get(other.fees).set(auth(other.owner.token)).expect(200)).body as ExtraFee[])[0];
      expect(owed).toMatchObject({ status: 'requested', amountSen: 1000, used: { minutes: 25, sen: 1000, refundSen: 0, refund: null } });
    });

    it('overtime: paid 30 min, report sent 10 min after the end → RM10 used, RM10 back (R48-2, R48-4)', async () => {
      const { cg, owner, order, fees } = await inService();
      await http().post(`/api/orders/${order.id}/visits/0/confirm-entry`).set(auth(owner.token)).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/overtime`).set(auth(cg.token)).send({ units: 2 }).expect(200);
      const fee = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      const { paymentId } = (await http().post(`${fees}/${fee.id}/pay`).set(auth(owner.token)).send({ method: 'tng' }).expect(200)).body as { paymentId: number };
      await succeed(paymentId);
      // The booked service ended 10 min ago.
      const minutes = fee.visit.minutes;
      await db().query("UPDATE orders SET visits = jsonb_set(visits::jsonb, '{0,start}', to_jsonb($2::int))::json WHERE id = $1", [order.id, nowMin() - minutes - 10]);
      await db().query("UPDATE visit_runs SET entered_at = now() - make_interval(mins => $2::int) WHERE order_id = $1 AND idx = 0", [order.id, minutes + 15]);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      const base = `/api/caregiver/tasks/${order.id}/0`;
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'a.jpg').expect(200);
      const v0 = (await http().get(base).set(auth(cg.token)).expect(200)).body as VisitTask;
      for (const c of v0.checklist) await http().post(`${base}/check`).set(auth(cg.token)).send({ item: c.item, done: true }).expect(200);
      const v = (await http().post(`${base}/report`).set(auth(cg.token)).expect(200)).body as VisitTask;
      expect(v.overtime).toMatchObject({ status: 'paid', units: 2, usedMin: 15, usedSen: 1000 });

      const after = ((await http().get(fees).set(auth(owner.token)).expect(200)).body as ExtraFee[])[0];
      expect(after.used).toEqual({ minutes: 15, sen: 1000, refundSen: 1000, refund: 'on_its_way' });
      const o16 = (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      expect(o16.lines.find((l) => l.key === `o${fee.id}`)).toMatchObject({ reason: 'Overtime: unused time', amountSen: 1000, state: 'on_its_way' });
    });
  });

  describe('E12-1 caregiver reports a problem', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const accepted = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, base: `/api/caregiver/tasks/${order.id}/0/problem` };
    };

    it('sends a report with contact tries; the owner is told; photos and tries can be added (R49-1 … R49-4)', async () => {
      const { cg, owner, order, base } = await accepted();
      expect((await http().get(base).set(auth(cg.token)).expect(200)).body).toEqual({ report: null });
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'dispute_evidence', description: 'x' }).expect(400)).body).toMatchObject({ code: 'PROBLEM_INVALID', message: 'Choose what went wrong' });
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'no_entry', description: ' ' }).expect(400)).body.message).toBe('Describe the problem');
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'no_entry', description: 'x', contacts: [{ method: 'emailed' }] }).expect(400)).body.code).toBe('CONTACT_INVALID');

      const fiveAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      const r = (await http().post(base).set(auth(cg.token)).send({
        kind: 'no_entry',
        description: 'Code wrong, phone not answered twice',
        contacts: [{ method: 'called', note: 'no answer', at: fiveAgo }, { method: 'called', note: 'again', at: '2020-01-01T00:00:00Z' }],
      }).expect(200)).body as ProblemReport;
      expect(r).toMatchObject({ orderId: order.id, number: order.number, index: 0, kind: 'no_entry', status: 'sent', decision: null, photos: [] });
      expect(r.contacts.map((c) => [c.method, c.note])).toEqual([['called', 'no answer'], ['called', 'again']]);
      expect(Math.abs(klInstant(r.contacts[0].at).getTime() - Date.parse(fiveAgo))).toBeLessThan(2_000);
      // A time too far back is taken as now.
      expect(Date.now() - klInstant(r.contacts[1].at).getTime()).toBeLessThan(60_000);

      const m = (await db().query('SELECT title, body, link_type, link_id FROM messages WHERE user_id = $1 AND title LIKE $2', [owner.id, '%reported a problem%'])).rows;
      expect(m).toEqual([{ title: "Siti A. reported a problem: Can't get in", body: `Order ${order.number}, visit 1: Code wrong, phone not answered twice. Our team will look at it and may contact you.`, link_type: 'order', link_id: order.id }]);
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'late', description: 'again' }).expect(409)).body.code).toBe('PROBLEM_OPEN');

      // Photos (JPEG/PNG, up to 6) and more contact tries while open.
      await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', Buffer.from('nope'), 'a.txt').expect(400);
      for (let n = 0; n < 6; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      expect((await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(409)).body.code).toBe('TOO_MANY_PHOTOS');
      const more = (await http().post(`${base}/contacts`).set(auth(cg.token)).send({ method: 'knocked', note: '' }).expect(200)).body as ProblemReport;
      expect(more.photos).toHaveLength(6);
      expect(more.contacts.map((c) => c.method)).toEqual(['called', 'called', 'knocked']);
      const photo = await http().get(`${base}/photos/${more.photos[0]}`).set(auth(cg.token)).expect(200);
      expect(photo.headers['content-type']).toBe('image/jpeg');

      // Only this caregiver sees it.
      const other = await caregiver();
      await http().get(base).set(auth(other.token)).expect(404);

      // Admin Cases page: listed, review starts, the caregiver is told.
      const admin = await adminLogin(app, ['cases']);
      const rows = (await http().get('/api/admin/problems').set(admin.header).expect(200)).body as AdminProblemRow[];
      expect(rows.find((x) => x.id === r.id)).toMatchObject({ number: order.number, visit: 1, caregiver: 'Siti A.', kind: 'no_entry', photos: 6, contacts: 3, status: 'sent' });
      await http().post(`/api/admin/problems/${r.id}/review`).set(admin.header).expect(200);
      expect((await http().post(`/api/admin/problems/${r.id}/review`).set(admin.header).expect(409)).body.code).toBe('PROBLEM_NOT_NEW');
      expect(((await http().get(base).set(auth(cg.token)).expect(200)).body as { report: ProblemReport }).report.status).toBe('reviewing');
      expect((await db().query('SELECT 1 FROM messages WHERE user_id = $1 AND title = $2', [cg.id, 'We are reviewing your report on visit 1'])).rowCount).toBe(1);
      const noPage = await adminLogin(app, ['payments']);
      await http().get('/api/admin/problems').set(noPage.header).expect(403);
    }, 20_000);

    it('cannot report once the report is sent, except evidence while a dispute is open (R49-1, R49-2)', async () => {
      const { cg, order, base } = await accepted();
      await db().query("INSERT INTO visit_runs (order_id, idx, status, reported_at) VALUES ($1, 0, 'report_sent', now()) ON CONFLICT (order_id, idx) DO UPDATE SET status = 'report_sent'", [order.id]);
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'late', description: 'x' }).expect(400)).body).toMatchObject({ code: 'CANNOT_REPORT', message: 'Problems can be reported from acceptance until the report is sent' });
      await db().query("UPDATE visit_runs SET status = 'disputed' WHERE order_id = $1 AND idx = 0", [order.id]);
      expect((await http().post(base).set(auth(cg.token)).send({ kind: 'late', description: 'x' }).expect(400)).body.code).toBe('PROBLEM_INVALID');
      expect(((await http().post(base).set(auth(cg.token)).send({ kind: 'dispute_evidence', description: 'Photos of the litter' }).expect(200)).body as ProblemReport).kind).toBe('dispute_evidence');
    });
  });

  describe('E12-2 owner reports a problem and follows it', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const accepted = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, visit: `/api/orders/${order.id}/visits/0` };
    };

    it('raises a case before the report; the timeline, the caregiver report, photos and notes show; the report goes to review (R50-1 … R50-4)', async () => {
      const { cg, owner, order, visit } = await accepted();
      // Report problem is only for a sent report.
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'report').field('description', 'x').expect(400)).body).toMatchObject({ code: 'CASE_INVALID', message: 'Report problem is for a sent report' });
      // The caregiver reported first.
      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'no_entry', description: 'Gate locked' }).expect(200);
      const c = (await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'no_show').field('description', 'Nobody came at 10').expect(200)).body as VisitCase;
      expect(c).toMatchObject({ kind: 'no_show', status: 'sent', reviewingAt: null, decidedAt: null, decision: null, notes: [], photos: [], caregiverReport: { kind: "Can't get in" } });
      let d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.caseVisits).toEqual([0]);
      expect(d.runs[0].status).toBe('todo');
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'again').expect(409)).body.code).toBe('CASE_OPEN');
      const h = await db().query("SELECT from_status, to_status FROM status_history WHERE entity = 'case' AND entity_id = $1", [c.id]);
      expect(h.rows).toEqual([{ from_status: null, to_status: 'sent' }]);
      expect((await db().query('SELECT body FROM messages WHERE user_id = $1 AND title = $2', [cg.id, 'Problem raised on visit 1'])).rows[0].body).toContain("(Caregiver didn't come)");

      // R50-4: photos (up to 3 in all) and notes while open.
      for (let n = 0; n < 3; n++) await http().post(`${visit}/case/photos`).set(auth(owner.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      expect((await http().post(`${visit}/case/photos`).set(auth(owner.token)).attach('photo', JPEG, 'a.jpg').expect(409)).body.code).toBe('TOO_MANY_PHOTOS');
      expect((await http().post(`${visit}/case/notes`).set(auth(owner.token)).send({ body: ' ' }).expect(400)).body.code).toBe('NOTE_INVALID');
      const noted = (await http().post(`${visit}/case/notes`).set(auth(owner.token)).send({ body: ' I was home all morning ' }).expect(200)).body as VisitCase;
      expect(noted.photos).toHaveLength(3);
      expect(noted.notes.map((n) => n.body)).toEqual(['I was home all morning']);
      const stranger = await login();
      await http().post(`${visit}/case/notes`).set(auth(stranger.token)).send({ body: 'hi' }).expect(404);

      // Admin starts the review: the owner's message links to the order (no report yet).
      const admin = await adminLogin(app, ['cases']);
      expect(((await http().get('/api/admin/cases').set(admin.header).expect(200)).body as AdminCaseRow[]).find((x) => x.id === c.id)).toMatchObject({ kind: 'no_show', photos: 3 });
      await http().post(`/api/admin/cases/${c.id}/review`).set(admin.header).expect(200);
      expect((await db().query('SELECT link_type, link_id FROM messages WHERE user_id = $1 AND title = $2', [owner.id, 'We are reviewing visit 1'])).rows).toEqual([{ link_type: 'order', link_id: order.id }]);
      expect(((await http().get(`${visit}/case`).set(auth(owner.token)).expect(200)).body as VisitCase).reviewingAt).not.toBeNull();

      // The caregiver still does the visit; the report goes straight to review, not the 12 h clock.
      const base = `/api/caregiver/tasks/${order.id}/0`;
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      await http().post(`${base}/arrive`).set(auth(cg.token)).expect(200);
      await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter', 'walk']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      await http().post(`${base}/report`).set(auth(cg.token)).expect(200);
      d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0].status).toBe('disputed');
      expect((await db().query('SELECT body FROM messages WHERE user_id = $1 AND title = $2', [owner.id, 'Report for visit 1 is ready'])).rows[0].body).toContain('part of the problem you raised');
      expect((await http().post(`${visit}/confirm`).set(auth(owner.token)).expect(409)).body.code).toBe('CASE_OPEN');

      // Once decided (E12-3), nothing more can be added.
      await db().query("UPDATE cases SET status = 'decided', decided_at = now(), decision = 'Full refund' WHERE id = $1", [c.id]);
      const decided = (await http().get(`${visit}/case`).set(auth(owner.token)).expect(200)).body as VisitCase;
      expect(decided).toMatchObject({ status: 'decided', decision: 'Full refund' });
      expect((await http().post(`${visit}/case/notes`).set(auth(owner.token)).send({ body: 'more' }).expect(409)).body.code).toBe('CASE_DECIDED');
    }, 20_000);

    it('cannot raise on a confirmed or cancelled visit, or before acceptance (R50-1)', async () => {
      const { owner, order, visit } = await accepted();
      await db().query("INSERT INTO visit_runs (order_id, idx, status, reported_at, confirmed_at, confirmed_by) VALUES ($1, 0, 'confirmed', now(), now(), 'owner')", [order.id]);
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'x').expect(409)).body.code).toBe('ALREADY_CONFIRMED');
      await db().query("UPDATE visit_runs SET status = 'cancelled', cancelled_at = now(), cancel_percent = 100, cancel_refund_sen = 0, cancel_credit_sen = 0 WHERE order_id = $1", [order.id]);
      expect((await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'x').expect(409)).body.code).toBe('CANNOT_RAISE');
      const cg = await caregiver();
      const paid = await paidOrder(cg);
      await succeed(paid.paymentId);
      expect((await http().post(`/api/orders/${paid.order.id}/visits/0/case`).set(auth(paid.owner.token)).field('kind', 'late').field('description', 'x').expect(409)).body.code).toBe('CANNOT_RAISE');
    });
  });

  describe('E12-3 admin handles exceptions', () => {
    const accepted = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order, visit: `/api/orders/${order.id}/visits/0`, admin: `/api/admin/exceptions/${order.id}/0` };
    };
    const decidedMessages = async (userId: number) => (await db().query('SELECT body FROM messages WHERE user_id = $1 AND title = $2', [userId, 'Decision on visit 1'])).rows.map((r) => r.body as string);

    it('lists both sides, needs a reason, closes the visit and refunds it (R51-1 … R51-5)', async () => {
      const { cg, owner, order, visit, admin: url } = await accepted();
      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'no_entry', description: 'Gate locked', contacts: [{ method: 'called', note: 'no answer' }] }).expect(200);
      await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'late').field('description', 'Nobody by 10:20').expect(200);
      await http().post(`${visit}/case/notes`).set(auth(owner.token)).send({ body: 'Gate was open' }).expect(200);

      const admin = await adminLogin(app, ['exceptions']);
      const row = ((await http().get('/api/admin/exceptions').set(admin.header).expect(200)).body as AdminExceptionRow[]).find((r) => r.orderId === order.id);
      expect(row).toMatchObject({ number: order.number, index: 0, from: 'both', kinds: ["Can't get in", 'Late'], status: 'open', fault: null });
      const d = (await http().get(url).set(admin.header).expect(200)).body as ExceptionDetail;
      expect(d).toMatchObject({ caregiver: 'Siti Aminah', run: { status: 'todo', arrivedAt: null, locationFlag: null }, decision: null });
      expect(d.paidSen).toBeGreaterThan(0);
      expect(d.caregiverReport).toMatchObject({ kind: "Can't get in", description: 'Gate locked', contacts: [expect.objectContaining({ method: 'called', note: 'no answer' })] });
      expect(d.ownerCase).toMatchObject({ kind: 'Late', description: 'Nobody by 10:20', notes: [expect.objectContaining({ body: 'Gate was open' })] });

      // R51-3: no reason, or more than the default, is blocked.
      expect((await http().post(`${url}/decide`).set(admin.header).send({ fault: 'caregiver', refundPercent: 100, reason: ' ' }).expect(400)).body).toMatchObject({ code: 'DECISION_INVALID', message: 'Write the reason for this decision' });
      expect((await http().post(`${url}/decide`).set(admin.header).send({ fault: 'owner', refundPercent: 20, reason: 'Code wrong' }).expect(400)).body.message).toBe('Refund can be at most 0% for this decision');

      const after = (await http().post(`${url}/decide`).set(admin.header).send({ fault: 'caregiver', refundPercent: 100, reason: 'The caregiver could have called the guard' }).expect(200)).body as ExceptionDetail;
      expect(after.decision).toMatchObject({ fault: 'caregiver', refundPercent: 100, refundSen: d.paidSen, creditSen: 0, reason: 'The caregiver could have called the guard', admin: admin.username });
      expect(after.run.status).toBe('closed');
      expect((await http().post(`${url}/decide`).set(admin.header).send({ fault: 'none', refundPercent: 100, reason: 'Again please' }).expect(409)).body.code).toBe('ALREADY_DECIDED');

      // R51-4: refund through the refund flow; the visit is closed for the caregiver.
      const pay = await db().query('SELECT amount_sen FROM payments WHERE ref = $1', [`order-${order.id}-refund-x0`]);
      expect(pay.rows).toEqual([{ amount_sen: d.paidSen }]);
      const refunds = (await http().get(`/api/orders/${order.id}/refunds`).set(auth(owner.token)).expect(200)).body as OrderRefunds;
      expect(refunds.lines.find((l) => l.key === 'x0')).toMatchObject({ reason: 'Visit 1: problem decision', amountSen: d.paidSen });
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(409)).body.message).toBe('This visit was closed by our team');
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/0`).set(auth(cg.token)).expect(200)).body as VisitTask).status).toBe('closed');

      // R51-5: both see Decided with the same words, and both are told.
      const text = `Caregiver at fault · RM${d.paidSen / 100} refunded to the owner. Reason: The caregiver could have called the guard`;
      expect((await http().get(`${visit}/case`).set(auth(owner.token)).expect(200)).body).toMatchObject({ status: 'decided', decision: text });
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).expect(200)).body as { report: ProblemReport }).report).toMatchObject({ status: 'decided', decision: text });
      expect(await decidedMessages(owner.id)).toEqual([expect.stringContaining(text)]);
      expect(await decidedMessages(cg.id)).toEqual([expect.stringContaining(text)]);
      expect(((await http().get('/api/admin/exceptions').set(admin.header).expect(200)).body as AdminExceptionRow[]).find((r) => r.orderId === order.id)).toMatchObject({ status: 'decided', fault: 'caregiver' });
      const noPage = await adminLogin(app, ['cases']);
      await http().get('/api/admin/exceptions').set(noPage.header).expect(403);
    }, 20_000);

    it('owner at fault: no refund, 50/50; disputes on a sent report are not in the queue (R51-1, R51-3)', async () => {
      const { cg, owner, order, visit, admin: url } = await accepted();
      await http().post(`${visit}/case`).set(auth(owner.token)).field('kind', 'no_show').field('description', 'Nobody came').expect(200);
      const admin = await adminLogin(app, ['exceptions']);
      const after = (await http().post(`${url}/decide`).set(admin.header).send({ fault: 'owner', refundPercent: 0, reason: 'Owner gave the wrong code' }).expect(200)).body as ExceptionDetail;
      expect(after.decision).toMatchObject({ fault: 'owner', refundSen: 0 });
      expect((await db().query('SELECT 1 FROM payments WHERE ref = $1', [`order-${order.id}-refund-x0`])).rowCount).toBe(0);
      expect(await decidedMessages(cg.id)).toEqual([expect.stringContaining('Owner at fault (no handover) · no refund · visit fee split 50/50 with the caregiver.')]);

      // Not an exception: a case on a sent report (E12-5), or nothing raised.
      const other = await accepted();
      await db().query("INSERT INTO visit_runs (order_id, idx, status, reported_at) VALUES ($1, 0, 'report_sent', now())", [other.order.id]);
      await http().post(`${other.visit}/case`).set(auth(other.owner.token)).field('kind', 'report').field('description', 'Litter').expect(200);
      expect(((await http().get('/api/admin/exceptions').set(admin.header).expect(200)).body as AdminExceptionRow[]).some((r) => r.orderId === other.order.id)).toBe(false);
      expect((await http().post(`${other.admin}/decide`).set(admin.header).send({ fault: 'none', refundPercent: 100, reason: 'Nothing here' }).expect(404)).body.code).toBe('EXCEPTION_NOT_FOUND');
      await http().get(`/api/admin/exceptions/${other.order.id}/1`).set(admin.header).expect(404);
    }, 20_000);
  });

  describe('E12-4 owner approves a substitute', () => {
    /** An accepted order whose caregiver reported they cannot do visit 1, and a second caregiver who could. */
    const setup = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'cannot_serve', description: 'I am unwell this week' }).expect(200);
      const cg2 = await caregiver();
      const admin = await adminLogin(app, ['exceptions']);
      const v = order.visits;
      const pick = [{ index: 0, start: v[0].start + 60 }, { index: 1, start: v[1].start }];
      return { cg, cg2, owner, order, admin, pick, url: `/api/admin/exceptions/${order.id}/0` };
    };
    const offer = (url: string, header: Record<string, string>, body: object, code = 200) => http().post(`${url}/substitute`).set(header).send(body).expect(code);

    it('the admin finds a free caregiver and offers; the owner approves; the visits move (R52-1 … R52-4)', async () => {
      const { cg, cg2, owner, order, admin, pick, url } = await setup();
      const list = (await http().get(`${url}/candidates?visits=${pick.map((p) => `${p.index}:${p.start}`).join(',')}`).set(admin.header).expect(200)).body as SubstituteCandidate[];
      expect(list.map((c) => c.id)).toContain(cg2.id);
      expect(list.map((c) => c.id)).not.toContain(cg.id);
      expect((await offer(url, admin.header, { caregiverId: cg2.id, visits: pick, reason: 'no' }, 400)).body).toMatchObject({ code: 'SUBSTITUTE_INVALID', message: 'Write the reason for the owner' });
      expect((await offer(url, admin.header, { caregiverId: cg.id, visits: pick, reason: 'Siti is unwell' }, 409)).body.code).toBe('CAREGIVER_NOT_FREE');

      const sent = (await offer(url, admin.header, { caregiverId: cg2.id, visits: pick, reason: 'Siti is unwell this week' })).body as SubstituteOffer;
      expect(sent).toMatchObject({ status: 'waiting', caregiver: { id: cg2.id }, from: 'Siti A.', problem: "Can't do the service", reason: 'Siti is unwell this week', newOrder: null });
      expect(sent.visits).toEqual([{ index: 0, date: order.visits[0].date, start: order.visits[0].start, newStart: pick[0].start }, { index: 1, date: order.visits[1].date, start: order.visits[1].start, newStart: pick[1].start }]);
      expect((await offer(url, admin.header, { caregiverId: cg2.id, visits: pick, reason: 'Again please' }, 409)).body.code).toBe('SUBSTITUTE_WAITING');
      expect((await http().post(`${url}/decide`).set(admin.header).send({ fault: 'none', refundPercent: 100, reason: 'Not now' }).expect(409)).body.code).toBe('SUBSTITUTE_WAITING');
      expect(((await http().get('/api/admin/exceptions').set(admin.header).expect(200)).body as AdminExceptionRow[]).find((r) => r.orderId === order.id)).toMatchObject({ status: 'offered', substitute: 'waiting' });
      // R52-1: nothing changes until the owner approves.
      let d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.substitute?.id).toBe(sent.id);
      expect(d.runs.map((r) => r.status)).toEqual(['todo', 'todo']);
      expect((await db().query('SELECT 1 FROM messages WHERE user_id = $1 AND title = $2', [owner.id, 'A substitute caregiver for you to approve'])).rowCount).toBe(1);
      const stranger = await login();
      await http().post(`/api/orders/${order.id}/substitute/approve`).set(auth(stranger.token)).expect(404);

      const done = (await http().post(`/api/orders/${order.id}/substitute/approve`).set(auth(owner.token)).expect(200)).body as SubstituteOffer;
      expect(done.status).toBe('approved');
      expect(done.newOrder).not.toBeNull();
      d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs.map((r) => r.status)).toEqual(['moved', 'moved']);
      expect(d.substitute).toBeNull();
      const moved = (await http().get(`/api/orders/${done.newOrder!.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(moved).toMatchObject({ status: 'accepted', caregiver: { id: cg2.id }, substituteOf: { id: order.id, number: order.number } });
      expect(moved.visits.map((v) => [v.date, v.start, v.paidSen])).toEqual([[order.visits[0].date, pick[0].start, order.visits[0].paidSen], [order.visits[1].date, pick[1].start, order.visits[1].paidSen]]);
      // R52-4: the new caregiver has the visits; the old one cannot start them.
      expect(((await http().get(`/api/caregiver/tasks/${done.newOrder!.id}/0`).set(auth(cg2.token)).expect(200)).body as VisitTask).status).toBe('todo');
      expect((await db().query("SELECT count(*)::int AS n FROM booked_visits WHERE order_id = $1 AND caregiver_id = $2", [done.newOrder!.id, cg2.id])).rows[0].n).toBe(2);
      expect((await db().query('SELECT count(*)::int AS n FROM booked_visits WHERE order_id = $1', [order.id])).rows[0].n).toBe(0);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      expect((await http().post(`/api/caregiver/tasks/${order.id}/0/arrive`).set(auth(cg.token)).expect(409)).body.message).toBe('This visit moved to another caregiver');
      expect(((await http().get(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).expect(200)).body as { report: ProblemReport }).report).toMatchObject({ status: 'decided', decision: expect.stringMatching(/^Substitute approved: .+ takes 2 visits\. Price unchanged\.$/) });
      for (const [id, title] of [[owner.id, 'Substitute approved'], [cg.id, 'Visit 1, 2 moved to another caregiver'], [cg2.id, 'New visits for you']] as const) {
        expect((await db().query('SELECT 1 FROM messages WHERE user_id = $1 AND title = $2', [id, title])).rowCount).toBe(1);
      }
      expect((await http().post(`/api/orders/${order.id}/substitute/approve`).set(auth(owner.token)).expect(409)).body.code).toBe('NO_SUBSTITUTE');
      expect(((await http().get('/api/admin/exceptions').set(admin.header).expect(200)).body as AdminExceptionRow[]).find((r) => r.orderId === order.id)).toMatchObject({ status: 'decided', substitute: 'approved' });
    }, 30_000);

    it('declined or not answered in time: the visits are refunded in full (R52-5)', async () => {
      const a = await setup();
      await offer(a.url, a.admin.header, { caregiverId: a.cg2.id, visits: a.pick, reason: 'Siti is unwell this week' });
      const declined = (await http().post(`/api/orders/${a.order.id}/substitute/decline`).set(auth(a.owner.token)).expect(200)).body as SubstituteOffer;
      expect(declined.status).toBe('declined');
      const d = (await http().get(`/api/orders/${a.order.id}/detail`).set(auth(a.owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs.map((r) => r.status)).toEqual(['closed', 'closed']);
      const pays = await db().query('SELECT ref, amount_sen FROM payments WHERE ref LIKE $1 ORDER BY ref', [`order-${a.order.id}-refund-x%`]);
      expect(pays.rows).toEqual([{ ref: `order-${a.order.id}-refund-x0`, amount_sen: a.order.visits[0].paidSen }, { ref: `order-${a.order.id}-refund-x1`, amount_sen: a.order.visits[1].paidSen }]);
      expect((await db().query('SELECT fault, refund_percent FROM visit_decisions WHERE order_id = $1 ORDER BY idx', [a.order.id])).rows).toEqual([{ fault: 'no_substitute', refund_percent: 100 }, { fault: 'no_substitute', refund_percent: 100 }]);

      const b = await setup();
      await offer(b.url, b.admin.header, { caregiverId: b.cg2.id, visits: [b.pick[0]], reason: 'Siti is unwell this week' });
      expect((await http().post('/api/dev/substitute-due').send({ number: b.order.number }).expect(200)).body.expired).toBeGreaterThanOrEqual(1);
      expect(((await http().get(`/api/orders/${b.order.id}/substitute`).set(auth(b.owner.token)).expect(200)).body as { offer: SubstituteOffer }).offer.status).toBe('expired');
      const runs = ((await http().get(`/api/orders/${b.order.id}/detail`).set(auth(b.owner.token)).expect(200)).body as OrderDetail).runs.map((r) => r.status);
      expect(runs).toEqual(['closed', 'todo']);
      expect((await http().post(`/api/orders/${b.order.id}/substitute/decline`).set(auth(b.owner.token)).expect(409)).body.code).toBe('NO_SUBSTITUTE');
    }, 30_000);
  });

  describe('E13-1 order settlement', () => {
    const settle = (number: string, code = 200) => http().post('/api/dev/order-settled').send({ number }).expect(code);
    const finish = (number: string) => http().post('/api/dev/order-finish').send({ number }).expect(200);
    const accepted = async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      return { cg, owner, order };
    };
    const payouts = async (orderId: number) => (await db().query("SELECT id, amount_sen, payee, status FROM payments WHERE kind = 'payout' AND ref = $1", [`order-${orderId}-payout`])).rows;
    const titles = async (userId: number) => (await db().query('SELECT title FROM messages WHERE user_id = $1 ORDER BY id', [userId])).rows.map((r) => r.title as string);

    it('pays 85% of each visit and 100% of waiting, once, when every visit is final (R53-1, R53-2, R53-4)', async () => {
      const { cg, order } = await accepted();
      expect((await settle(order.number, 409)).body).toMatchObject({ code: 'NOT_READY', message: 'Not ready to settle: Visit 1 is not final yet' });
      await finish(order.number);
      // A waiting fee paid and fully used goes 100% to the caregiver.
      await db().query("INSERT INTO extra_fees (order_id, idx, kind, units, amount_sen, status, paid_at, used_min, used_sen) VALUES ($1, 1, 'waiting', 1, 1000, 'paid', now(), 20, 1000)", [order.id]);
      const [a, b] = order.visits.map((v) => v.quote.total);
      const want = Math.round(a * 0.85) + Math.round(b * 0.85) + 1000;
      const r = (await settle(order.number)).body as SettleResult;
      expect(r).toMatchObject({ state: 'paying', amountSen: want, rewarded: false });
      expect(r.lines.map((l) => [l.label, l.caregiverSen])).toEqual([['Visit 1 service', Math.round(a * 0.85)], ['Visit 2 service', Math.round(b * 0.85)], ['Visit 2 waiting fee', 1000]]);
      expect(await payouts(order.id)).toEqual([expect.objectContaining({ amount_sen: want, payee: `caregiver-${cg.id}`, status: 'pending' })]);
      expect(await titles(cg.id)).toContain(`Payout on its way: RM${want / 100}`);

      // Never twice: the 10-minute check and the test tool again do nothing more.
      await app.get(SettlementsService).settleDue();
      expect((await settle(order.number)).body.state).toBe('paying');
      const [p] = await payouts(order.id);
      expect(await payouts(order.id)).toHaveLength(1);
      await succeed(Number(p.id));
      expect((await settle(order.number)).body.state).toBe('paid');
      expect(await titles(cg.id)).toContain(`Paid: RM${want / 100}`);
    }, 30_000);

    it('an open problem freezes it; refunds must land; a caregiver-fault visit pays nothing (R53-1, R53-2)', async () => {
      const { cg, order } = await accepted();
      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'cannot_serve', description: 'I am unwell this week' }).expect(200);
      expect((await settle(order.number, 409)).body.message).toBe('Not ready to settle: A problem or dispute is still open');
      const admin = await adminLogin(app, ['exceptions']);
      await http().post(`/api/admin/exceptions/${order.id}/0/decide`).set(admin.header).send({ fault: 'caregiver', refundPercent: 100, reason: 'Could not come' }).expect(200);
      await finish(order.number);
      expect((await settle(order.number, 409)).body.message).toBe('Not ready to settle: A refund has not landed yet');
      const refund = (await db().query('SELECT id FROM payments WHERE ref = $1', [`order-${order.id}-refund-x0`])).rows[0];
      await succeed(Number(refund.id));
      const b = order.visits[1].quote.total;
      const r = (await settle(order.number)).body as SettleResult;
      expect(r.lines.map((l) => [l.kind, l.caregiverSen])).toEqual([['caregiver_fault', 0], ['service', Math.round(b * 0.85)]]);
      expect(r.amountSen).toBe(Math.round(b * 0.85));
    }, 30_000);
  });

  describe('E13-2 caregiver income', () => {
    it('keeps pending, frozen, paying and paid this month apart; only my own (R54-2, R54-3, R54-5)', async () => {
      const cg = await caregiver();
      const accept = async (shift: number) => {
        const { order, paymentId } = await paidOrder(cg, undefined, shift);
        await succeed(paymentId);
        await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
        return order;
      };
      const expected = (o: OrderView) => o.visits.reduce((t, v) => t + Math.round(v.quote.total * 0.85), 0);
      const a = await accept(0);
      const b = await accept(3);
      await http().post(`/api/caregiver/tasks/${b.id}/0/problem`).set(auth(cg.token)).send({ kind: 'cannot_serve', description: 'I am unwell this week' }).expect(200);
      const c = await accept(6);
      await http().post('/api/dev/order-finish').send({ number: c.number }).expect(200);
      await http().post('/api/dev/order-settled').send({ number: c.number }).expect(200);
      const income = async () => (await http().get('/api/caregiver/income').set(auth(cg.token)).expect(200)).body as CaregiverIncome;

      let i = await income();
      expect(i).toMatchObject({ pendingSen: expected(a), frozenSen: expected(b), payingSen: expected(c), paidMonthSen: 0, fixing: false });
      expect(i.orders.map((o) => [o.number, o.visits, o.state])).toEqual([[c.number, 2, 'paying'], [b.number, 2, 'frozen'], [a.number, 2, 'pending']]);

      const payout = (await db().query('SELECT id FROM payments WHERE ref = $1', [`order-${c.id}-payout`])).rows[0];
      await succeed(Number(payout.id));
      i = await income();
      expect(i).toMatchObject({ payingSen: 0, paidMonthSen: expected(c) });
      expect(i.orders[0].state).toBe('paid');

      // R54-5: an owner, or another caregiver, sees none of it.
      const owner = await login();
      await http().get('/api/caregiver/income').set(auth(owner.token)).expect(403);
      const other = await caregiver();
      expect(await (await http().get('/api/caregiver/income').set(auth(other.token)).expect(200)).body).toMatchObject({ pendingSen: 0, orders: [] });
    }, 30_000);
  });

  describe('E13-3 order settlement detail', () => {
    it('shows each line, problems, refunds and the payout; matches what settlement saved (R55-2 … R55-6)', async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      const detail = async () => (await http().get(`/api/caregiver/income/${order.id}`).set(auth(cg.token)).expect(200)).body as OrderSettlement;
      const [a, b] = order.visits.map((v) => v.quote.total);

      let d = await detail();
      expect(d).toMatchObject({ number: order.number, state: 'pending', reason: 'Visit 1 is not final yet', amountSen: Math.round(a * 0.85) + Math.round(b * 0.85), payout: null, refunds: [], problems: [] });
      expect(d.lines.map((l) => [l.label, l.problemOpen])).toEqual([['Visit 1 service', false], ['Visit 2 service', false]]);

      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'cannot_serve', description: 'I am unwell this week' }).expect(200);
      d = await detail();
      expect(d.state).toBe('frozen');
      expect(d.lines[0].problemOpen).toBe(true);
      expect(d.problems).toEqual([{ index: 0, by: 'caregiver', kind: "Can't do the service", status: 'Sent' }]);

      const admin = await adminLogin(app, ['exceptions']);
      await http().post(`/api/admin/exceptions/${order.id}/0/decide`).set(admin.header).send({ fault: 'caregiver', refundPercent: 100, reason: 'Could not come' }).expect(200);
      d = await detail();
      expect(d).toMatchObject({ state: 'pending', reason: 'Visit 2 is not final yet' });
      expect(d.refunds).toEqual([{ key: 'x0', reason: 'Visit 1: problem decision', amountSen: order.visits[0].paidSen, done: false }]);
      expect(d.lines[0]).toMatchObject({ kind: 'caregiver_fault', caregiverSen: 0, problemOpen: false });

      await succeed(Number((await db().query('SELECT id FROM payments WHERE ref = $1', [`order-${order.id}-refund-x0`])).rows[0].id));
      await http().post('/api/dev/order-finish').send({ number: order.number }).expect(200);
      await http().post('/api/dev/order-settled').send({ number: order.number }).expect(200);
      d = await detail();
      const saved = (await db().query('SELECT amount_sen, lines FROM settlements WHERE order_id = $1', [order.id])).rows[0];
      expect(d.amountSen).toBe(saved.amount_sen);
      expect(d.lines.map((l) => ({ ...l, problemOpen: undefined }))).toEqual(saved.lines.map((l: object) => ({ ...l, problemOpen: undefined })));
      expect(d.refunds[0].done).toBe(true);
      expect(d).toMatchObject({ state: 'paying', payout: { amountSen: saved.amount_sen, state: 'paying' } });

      // R55-6: only the caregiver of the order.
      const other = await caregiver();
      await http().get(`/api/caregiver/income/${order.id}`).set(auth(other.token)).expect(404);
    }, 30_000);
  });

  describe('E13-4 money queue', () => {
    const settled = async () => {
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/order-finish').send({ number: order.number }).expect(200);
      await http().post('/api/dev/order-settled').send({ number: order.number }).expect(200);
      return { cg, order, base: `order-${order.id}-payout` };
    };
    const tries = async (base: string) => (await db().query('SELECT id::int AS id, ref, status FROM payments WHERE ref LIKE $1 ORDER BY id', [`${base}%`])).rows;
    const fail = (paymentId: number) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: 'failure' }).expect(200);

    it('a failed payout is sent again: two presses at once still pay once; nothing can be marked paid (R56-1 … R56-5)', async () => {
      const { cg, order, base } = await settled();
      const admin = await adminLogin(app, ['money']);
      const item = async () => ((await http().get('/api/admin/money').set(admin.header).expect(200)).body as MoneyItem[]).find((x) => x.id === base);
      expect(await item()).toMatchObject({ kind: 'payout', state: 'processing', tries: 1, late: false, what: expect.stringMatching(/^Payout to /) });
      // R56-3: a try still processing cannot be sent again.
      expect((await http().post(`/api/admin/money/${base}/send-again`).set(admin.header).expect(409)).body.code).toBe('NOT_FAILED');
      await fail((await tries(base))[0].id);
      expect(await item()).toMatchObject({ state: 'failed', lastFailure: 'Declined by bank (mock)' });
      expect(((await http().get(`/api/caregiver/income/${order.id}`).set(auth(cg.token)).expect(200)).body as OrderSettlement).state).toBe('failed');

      const codes = await Promise.all([1, 2].map(async () => (await http().post(`/api/admin/money/${base}/send-again`).set(admin.header)).status));
      expect(codes).toContain(200);
      expect((await tries(base)).map((t) => t.ref)).toEqual([base, `${base}-r1`]);
      expect(((await http().get(`/api/caregiver/income/${order.id}`).set(auth(cg.token)).expect(200)).body as OrderSettlement).state).toBe('paying');
      await succeed((await tries(base))[1].id);
      expect((await tries(base)).map((t) => t.status)).toEqual(['failed', 'succeeded']);
      expect((await http().post(`/api/admin/money/${base}/send-again`).set(admin.header).expect(409)).body.code).toBe('NOT_FAILED');

      const d = (await http().get(`/api/admin/money/${base}`).set(admin.header).expect(200)).body as MoneyDetail;
      expect(d).toMatchObject({ state: 'done', tries: 2, how: `Automatic payout to caregiver-${cg.id}`, lastFailure: null });
      expect(d.tryList.map((t) => t.status)).toEqual(['failed', 'succeeded']);
      expect(d.log.filter((l) => l.who.startsWith('Admin'))).toHaveLength(codes.filter((c) => c === 200).length);
      expect(d.log.find((l) => l.who.startsWith('Admin'))?.what).toBe(`Sent again by admin (try 2, ${base}-r1)`);
      const s = (await http().get(`/api/caregiver/income/${order.id}`).set(auth(cg.token)).expect(200)).body as OrderSettlement;
      expect(s).toMatchObject({ state: 'paid', payout: { state: 'paid' } });
      const titles = (await db().query('SELECT title FROM messages WHERE user_id = $1', [cg.id])).rows.map((r) => r.title);
      expect(titles.filter((t: string) => t.startsWith('Paid:'))).toHaveLength(1);
      // R56-4: there is no way to mark an item paid by hand.
      await http().post(`/api/admin/money/${base}/paid`).set(admin.header).expect(404);
    }, 30_000);

    it('a try processing for over 30 minutes can be checked with the bank (R56-4)', async () => {
      const { base } = await settled();
      const admin = await adminLogin(app, ['money']);
      expect((await http().post(`/api/admin/money/${base}/check`).set(admin.header).expect(409)).body.code).toBe('NOT_LATE');
      await db().query("UPDATE payments SET updated_at = now() - interval '31 minutes' WHERE ref = $1", [base]);
      const d = (await http().post(`/api/admin/money/${base}/check`).set(admin.header).expect(200)).body as MoneyDetail;
      expect(d).toMatchObject({ state: 'processing', late: true });
      expect(d.log[d.log.length - 1]).toMatchObject({ who: expect.stringMatching(/^Admin \(/), what: 'Checked with bank: no answer yet' });
    }, 30_000);
  });

  describe('E14-1 admin dashboard', () => {
    it('each count matches the rows waiting on its list; only allowed queues (R57-1 … R57-3)', async () => {
      // Something waiting on exceptions and on money.
      const cg = await caregiver();
      const { order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post(`/api/caregiver/tasks/${order.id}/0/problem`).set(auth(cg.token)).send({ kind: 'cannot_serve', description: 'I am unwell this week' }).expect(200);

      const admin = await adminLogin(app);
      const get = async <T>(path: string) => (await http().get(path).set(admin.header).expect(200)).body as T;
      // Other test files run at the same time, so compare a few times until both sides are read without a change in between.
      let ok = false;
      let last: unknown;
      for (let i = 0; i < 5 && !ok; i++) {
        const q = await get<QueueCount[]>('/api/admin/dashboard/queues');
        const money = await get<MoneyItem[]>('/api/admin/money');
        const lists = {
          caregivers: (await get<unknown[]>('/api/admin/caregivers')).length + (await get<unknown[]>('/api/admin/profile-changes')).length,
          pets: (await get<unknown[]>('/api/admin/pets')).length,
          exceptions: (await get<ExRow[]>('/api/admin/exceptions')).filter((r) => r.status === 'open').length,
          cases: (await get<CaseRow[]>('/api/admin/cases')).filter((r) => r.status !== 'decided').length + (await get<ProbRow[]>('/api/admin/problems')).filter((r) => r.status !== 'decided').length,
          money_failed: money.filter((m) => m.state === 'failed').length,
          money_late: money.filter((m) => m.state === 'processing' && m.late).length,
        };
        last = { q, lists };
        ok = q.every((x) => x.count === lists[x.key]);
      }
      expect(ok, JSON.stringify(last)).toBe(true);
      const q = await get<QueueCount[]>('/api/admin/dashboard/queues');
      expect(q.map((x) => x.key)).toEqual(['caregivers', 'pets', 'exceptions', 'cases', 'money_failed', 'money_late']);
      expect(q.find((x) => x.key === 'exceptions')!.count).toBeGreaterThanOrEqual(1);

      // R57-3: only the queues of pages this admin may open.
      const some = await adminLogin(app, ['dashboard', 'money']);
      expect(((await http().get('/api/admin/dashboard/queues').set(some.header).expect(200)).body as QueueCount[]).map((x) => x.key)).toEqual(['money_failed', 'money_late']);
      const none = await adminLogin(app, ['money']);
      await http().get('/api/admin/dashboard/queues').set(none.header).expect(403);
    }, 60_000);
  });

  describe('E14-2 admin orders', () => {
    const fail = (paymentId: number) => http().post(`/api/mock-gateway/payments/${paymentId}/outcome`).send({ outcome: 'failure' }).expect(200);
    it('booking and money filters are separate; search, dates and the detail with its record (R58-1 … R58-4)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      const admin = await adminLogin(app, ['orders']);
      const list = async (q: Record<string, string>) => (await http().get('/api/admin/orders').query(q).set(admin.header).expect(200)).body as AdminOrderPage;
      const one = async (q: Record<string, string>) => (await list({ q: order.number, ...q })).rows.map((r) => [r.booking, r.money]);

      expect(await one({})).toEqual([['waiting', 'unpaid']]);
      await succeed(paymentId);
      expect(await one({})).toEqual([['waiting', 'paid']]);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      expect(await one({})).toEqual([['accepted', 'paid']]);
      await http().post('/api/dev/order-finish').send({ number: order.number }).expect(200);
      await http().post('/api/dev/order-settled').send({ number: order.number }).expect(200);
      expect(await one({})).toEqual([['done', 'paying_out']]);
      const payout = (await db().query('SELECT id::int AS id FROM payments WHERE ref = $1', [`order-${order.id}-payout`])).rows[0].id;
      await fail(payout);
      expect(await one({})).toEqual([['done', 'payout_failed']]);

      // R58-2: each filter on its own and together.
      expect(await one({ booking: 'done' })).toHaveLength(1);
      expect(await one({ money: 'payout_failed' })).toHaveLength(1);
      expect(await one({ booking: 'done', money: 'payout_failed' })).toHaveLength(1);
      expect(await one({ booking: 'cancelled' })).toHaveLength(0);
      expect(await one({ booking: 'done', money: 'paid' })).toHaveLength(0);
      const today = klDate(new Date());
      expect(await one({ from: today, to: today })).toHaveLength(1);
      expect(await one({ from: addDays(today, 1) })).toHaveLength(0);
      const byPhone = await list({ q: `0${owner.phone.slice(3)}` });
      expect(byPhone.rows.map((r) => r.number)).toEqual([order.number]);
      expect(byPhone.rows[0]).toMatchObject({ owner: `+60 ${owner.phone.slice(3, 5)}-*** ${owner.phone.slice(-4)}`, visits: 2, cancelled: 0 });
      expect((await http().get('/api/admin/orders').query({ money: 'done' }).set(admin.header).expect(400)).body.code).toBe('BAD_FILTER');
      const page = await list({ booking: 'done' });
      expect(page).toMatchObject({ page: 1 });
      expect(page.rows.length).toBeLessThanOrEqual(20);
      expect(page.total).toBeGreaterThanOrEqual(1);

      // R58-3: the detail.
      const d = (await http().get(`/api/admin/orders/${order.id}`).set(admin.header).expect(200)).body as AdminOrderDetail;
      expect(d).toMatchObject({ number: order.number, booking: 'done', money: 'payout_failed', paidSen: order.paySen, payout: `order-${order.id}-payout`, refundedSen: 0 });
      expect(d.visitList.map((v) => [v.index, v.status, v.reportSent, v.exception])).toEqual([[0, 'Confirmed', true, false], [1, 'Confirmed', true, false]]);
      expect(d.log.map((l) => l.what)).toEqual(expect.arrayContaining([expect.stringMatching(/^Settled: RM/), expect.stringMatching(/^Payment failed: /)]));
      expect(JSON.stringify(d)).not.toContain(address.street);

      // R58-4: the address only on request, and recorded.
      const a = (await http().post(`/api/admin/orders/${order.id}/address`).set(admin.header).expect(200)).body as AdminOrderAddress;
      expect(a).toMatchObject({ street: address.street, postcode: address.postcode });
      const after = (await http().get(`/api/admin/orders/${order.id}`).set(admin.header).expect(200)).body as AdminOrderDetail;
      expect(after.log[after.log.length - 1]).toMatchObject({ who: `Admin (${admin.username})`, what: 'Address and entry notes shown' });

      const noPage = await adminLogin(app, ['cases']);
      await http().get('/api/admin/orders').set(noPage.header).expect(403);
      await http().get(`/api/admin/orders/${order.id}`).set(noPage.header).expect(403);
    }, 60_000);

    it('a withdrawn order is cancelled with its refund processing, then refunded (R58-2)', async () => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      await succeed(paymentId);
      await http().post(`/api/orders/${order.id}/withdraw`).set(auth(owner.token)).expect(200);
      const admin = await adminLogin(app, ['orders']);
      const row = async () => ((await http().get('/api/admin/orders').query({ q: order.number }).set(admin.header).expect(200)).body as AdminOrderPage).rows[0];
      expect(await row()).toMatchObject({ booking: 'cancelled', money: 'refund_processing' });
      await succeed((await db().query('SELECT id::int AS id FROM payments WHERE ref = $1', [`order-${order.id}-refund-${paymentId}`])).rows[0].id);
      expect(await row()).toMatchObject({ booking: 'cancelled', money: 'refunded' });
    }, 30_000);
  });

  describe('E8-6 location check', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const home = { lat: 3.1319, lng: 101.6841 };
    const near = { lat: 3.1329, lng: 101.6841 }; // ~110 m
    const far = { lat: 3.1419, lng: 101.6841 }; // ~1.1 km
    const started = async (withHome: boolean) => {
      const cg = await caregiver();
      const { owner, order, paymentId } = await paidOrder(cg);
      const a = (await http().get('/api/addresses').set(auth(owner.token)).expect(200)).body[0];
      if (withHome) {
        const saved = (await http().post(`/api/addresses/${a.id}`).set(auth(owner.token)).send({ ...address, home }).expect(200)).body;
        expect(saved.home).toEqual(home);
        // An edit without the home position keeps it.
        expect((await http().post(`/api/addresses/${a.id}`).set(auth(owner.token)).send({ ...address, label: 'Flat' }).expect(200)).body.home).toEqual(home);
      }
      await db().query("UPDATE orders SET entry_method = 'pre_authorised' WHERE id = $1", [order.id]);
      await succeed(paymentId);
      await http().post(`/api/requests/${order.id}/accept`).set(auth(cg.token)).expect(200);
      await http().post('/api/dev/visit-soon').send({ number: order.number, index: 0 }).expect(200);
      return { cg, owner, order, base: `/api/caregiver/tasks/${order.id}/0` };
    };
    const checks = async (id: number) =>
      (await db().query('SELECT moment, lat::float, lng::float, distance_m, flag FROM location_checks WHERE order_id = $1 ORDER BY id', [id])).rows;

    it('saves the location at arrive and send only, measures it from home and flags > 500 m (R38-1, R38-4)', async () => {
      const { cg, owner, order, base } = await started(true);
      const v = (await http().post(`${base}/arrive`).set(auth(cg.token)).send({ location: near }).expect(200)).body as VisitTask;
      expect(v.locationNotice).toBe('Your location is saved only now and when you send the report.');
      await http().post(`${base}/enter`).set(auth(cg.token)).expect(200);
      for (let n = 0; n < 3; n++) await http().post(`${base}/photos`).set(auth(cg.token)).attach('photo', JPEG, 'a.jpg').expect(200);
      for (const item of ['feed', 'water', 'litter', 'walk']) await http().post(`${base}/check`).set(auth(cg.token)).send({ item, done: true }).expect(200);
      await http().post(`${base}/report`).set(auth(cg.token)).send({ location: far }).expect(200);
      const rows = await checks(order.id);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ moment: 'arrive', lat: near.lat, lng: near.lng, flag: null });
      expect(rows[0].distance_m).toBeGreaterThan(100);
      expect(rows[0].distance_m).toBeLessThan(120);
      expect(rows[1]).toMatchObject({ moment: 'report', flag: 'far' });
      expect(rows[1].distance_m).toBeGreaterThan(1000);

      // R38-5: the owner sees only that a location was recorded.
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0].locationRecorded).toBe(true);
      expect(JSON.stringify(d)).not.toContain('distance');

      // R38-4: admin's list has the far one only.
      const admin = await adminLogin(app, ['locations']);
      const list = (await http().get('/api/admin/location-flags').set(admin.header).expect(200)).body as LocationFlagRow[];
      const mine = list.filter((r) => r.orderId === order.id);
      expect(mine).toEqual([expect.objectContaining({ number: order.number, visit: 1, moment: 'report', flag: 'far', caregiver: 'Siti Aminah' })]);
      const other = await adminLogin(app, ['payments']);
      await http().get('/api/admin/location-flags').set(other.header).expect(403);
    });

    it('not shared and no home position never block, and are flagged (R38-2, R38-3)', async () => {
      const { cg, owner, order, base } = await started(false);
      await http().post(`${base}/arrive`).set(auth(cg.token)).send({}).expect(200);
      const noHome = await started(false);
      await http().post(`${noHome.base}/arrive`).set(auth(noHome.cg.token)).send({ location: near }).expect(200);
      expect((await checks(order.id))[0]).toMatchObject({ moment: 'arrive', lat: null, distance_m: null, flag: 'not_shared' });
      expect((await checks(noHome.order.id))[0]).toMatchObject({ lat: near.lat, distance_m: null, flag: 'no_home' });
      const d = (await http().get(`/api/orders/${order.id}/detail`).set(auth(owner.token)).expect(200)).body as OrderDetail;
      expect(d.runs[0]).toMatchObject({ status: 'arrived', locationRecorded: false });
    });
  });

  describe('E14-3 rule versions', () => {
    it('a new version starts later, replaces the waiting one, and each order keeps its own (R59-1 … R59-7)', async () => {
      const admin = await adminLogin(app, ['rules']);
      const rulesApi = app.get(RulesService);
      const get = async () => (await http().get('/api/admin/rules').set(admin.header).expect(200)).body as RulesAdmin;
      const save = (body: object) => http().post('/api/admin/rules').set(admin.header).send(body);
      const before = await get();
      expect(before.current.state).toBe('in_effect');
      const tomorrow = tomorrowOf(klDate(new Date()));

      // R59-2, R59-3, R59-6: refused changes.
      expect((await save({ values: { 'capacity.maxPets': 4 }, effectiveFrom: tomorrow, reason: 'More pets' }).expect(400)).body.code).toBe('FIXED_RULE');
      expect((await save({ values: { 'price.cat': 5000 }, effectiveFrom: klDate(new Date()), reason: 'Price review' }).expect(400)).body.code).toBe('TOO_SOON');
      expect((await save({ values: { 'price.cat': 5000 }, effectiveFrom: tomorrow, reason: '' }).expect(400)).body.code).toBe('REASON_REQUIRED');
      expect((await save({ values: { 'price.dogUpgrade': 100 }, effectiveFrom: tomorrow, reason: 'Price review' }).expect(400)).body.code).toBe('BAD_ORDER');

      // R59-3: saved as waiting; today's rules unchanged.
      let page = (await save({ values: { 'price.cat': 4500 }, effectiveFrom: tomorrow, reason: 'First try' }).expect(200)).body as RulesAdmin;
      const first = page.waiting!;
      expect(first).toMatchObject({ effectiveFrom: tomorrow, state: 'waiting', reason: 'First try', admin: admin.username });
      expect(first.changes.map(ruleChangeText)).toEqual(['Prices · Cat: RM40 → RM45']);
      // R59-5: saving again replaces it.
      const values = { 'price.cat': 5000, 'cancel.fullRefundHours': 168, 'cancel.partialRefundPercent': 50, 'split.caregiverServicePercent': 80 };
      page = (await save({ values, effectiveFrom: tomorrow, reason: 'Price review Dec' }).expect(200)).body as RulesAdmin;
      const next = page.waiting!;
      expect(next.version).not.toBe(first.version);
      expect(page.history.find((h) => h.version === first.version)).toMatchObject({ state: 'withdrawn', withdrawReason: `Replaced by ${next.version}` });
      expect(page.history.filter((h) => h.state === 'waiting')).toHaveLength(1);
      expect(next.changes.map((c) => `${c.from} → ${c.to}`)).toEqual(['RM40 → RM50', '24 h → 168 h', '80% → 50%', '85% → 80%']);
      expect((await http().get('/api/rules').expect(200)).body).toEqual(before.current.rules);
      expect((await rulesApi.current(new Date(Date.now() + 86_400_000 * 2))).price.cat).toBe(5000);

      // R59-4: an order paid now keeps today's version; one paid under the new version uses its split and refunds.
      const cg = await caregiver();
      const cg2 = await caregiver();
      const old = await paidOrder(cg);
      const neu = await paidOrder(cg2);
      for (const [o, c] of [[old, cg], [neu, cg2]] as const) {
        await succeed(o.paymentId);
        await http().post(`/api/requests/${o.order.id}/accept`).set(auth(c.token)).expect(200);
      }
      expect((await db().query('SELECT rules_version FROM orders WHERE id = $1', [old.order.id])).rows[0].rules_version).toBe(before.current.version);
      await db().query('UPDATE orders SET rules_version = $2 WHERE id = $1', [neu.order.id, next.version]);
      const income = async (o: typeof old) => ((await http().get(`/api/requests/${o.order.id}`).set(auth((o === old ? cg : cg2).token)).expect(200)).body as RequestDetail).visitLines.map((l) => l.incomeSen);
      expect(await income(old)).toEqual([5950, 5950]);
      expect(await income(neu)).toEqual([5600, 5600]);
      const percents = async (o: typeof old) => ((await http().get(`/api/orders/${o.order.id}/cancel`).set(auth(o.owner.token)).expect(200)).body as CancelPreview).lines.map((l) => l.percent);
      expect(await percents(old)).toEqual([100, 100]);
      expect(await percents(neu)).toEqual([50, 50]);
      const settle = (await http().get(`/api/caregiver/income/${neu.order.id}`).set(auth(cg2.token)).expect(200)).body as OrderSettlement;
      expect(settle).toMatchObject({ amountSen: 11200, split: { caregiverServicePercent: 80 } });

      // R59-5: withdraw the waiting one; one in effect cannot be withdrawn.
      const reason = { reason: 'Not this month' };
      expect((await http().post(`/api/admin/rules/${next.version}/withdraw`).set(admin.header).send({}).expect(400)).body.code).toBe('REASON_REQUIRED');
      page = (await http().post(`/api/admin/rules/${next.version}/withdraw`).set(admin.header).send(reason).expect(200)).body as RulesAdmin;
      expect(page.waiting).toBeNull();
      expect(page.history.find((h) => h.version === next.version)).toMatchObject({ state: 'withdrawn', withdrawReason: 'Not this month' });
      expect((await http().post(`/api/admin/rules/${next.version}/withdraw`).set(admin.header).send(reason).expect(409)).body.code).toBe('NOT_WAITING');
      expect((await http().post(`/api/admin/rules/${before.current.version}/withdraw`).set(admin.header).send(reason).expect(409)).body.code).toBe('NOT_WAITING');
      // Its orders still use it.
      expect(await income(neu)).toEqual([5600, 5600]);

      const noPage = await adminLogin(app, ['orders']);
      await http().get('/api/admin/rules').set(noPage.header).expect(403);
      await http().post('/api/admin/rules').set(noPage.header).send({}).expect(403);
    }, 60_000);
  });
});
