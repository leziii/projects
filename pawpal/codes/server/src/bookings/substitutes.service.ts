import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  answerBy,
  bookingNeeds,
  canMove,
  checkSubstitute,
  clashingVisits,
  fitsBooking,
  orderNumber,
  startOptions,
  substituteApprovedText,
  visitTime,
  visitWhen,
  type Actor,
  type AdminUser,
  type Area,
  type OrderVisit,
  type PetKind,
  type SubstituteCandidate,
  type SubstituteOffer,
  type SubstituteVisit,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { ScheduleService } from '../caregivers/schedule.service';
import { TrustService } from '../caregivers/trust.service';
import { DbService } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { ExceptionsService } from './exceptions.service';
import { VisitRunsService } from './visit-runs.service';

const EVERY_MS = 60_000;

interface FullOrder {
  id: string;
  number: string;
  owner_id: number;
  caregiver_id: number;
  status: string;
  level: string;
  overtime_units: number;
  address_id: string;
  pets: { id: number; name: string; kind: PetKind }[];
  visits: OrderVisit[];
  rules_version: string;
  entry_method: string;
  entry_secret: string | null;
  health_confirmed_at: Date;
  charge_id: string | null;
  paid_at: Date | null;
  credit_sen: number;
}

/** E12-4 A10 / O20 (round 52): offer a substitute, then the owner approves (visits move) or not (refund). */
@Injectable()
export class SubstitutesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SubstitutesService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly runs: VisitRunsService,
    private readonly trust: TrustService,
    private readonly schedules: ScheduleService,
    private readonly exceptions: ExceptionsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R52-5: no answer in time counts as a decline, within a minute.
    this.timer = setInterval(() => void this.expireDue().catch((e: Error) => this.log.error(e.message)), EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R52-1: approved caregivers who serve the area, take the pets and are free at the chosen times. */
  async candidates(orderId: number, visits: { index: number; start: number }[]): Promise<SubstituteCandidate[]> {
    const o = await this.order(this.db.pool, orderId);
    return (await this.fitting(o, visits)).map((c) => ({ id: c.id, displayName: c.displayName, experienceYears: c.experienceYears, idVerified: c.idVerified, areas: c.areas }));
  }

  /** R52-1, R52-2: send the offer to the owner. Nothing changes until the owner approves. */
  async offer(admin: AdminUser, orderId: number, index: number, input: { caregiverId?: unknown; visits?: unknown; reason?: unknown }, now = new Date()): Promise<SubstituteOffer> {
    const pick = checkSubstitute(input, startOptions());
    await this.db.tx(async (client) => {
      const o = await this.order(client, orderId, true);
      const isException = (await client.query(
        "SELECT 1 FROM problem_reports WHERE order_id = $1 AND idx = $2 AND kind <> 'dispute_evidence' UNION SELECT 1 FROM cases WHERE order_id = $1 AND idx = $2 AND NOT on_report",
        [orderId, index],
      )).rowCount;
      if (!o.visits[index] || !isException) throw new NotFoundException({ code: 'EXCEPTION_NOT_FOUND', message: 'No problem was raised on this visit' });
      if ((await client.query('SELECT 1 FROM visit_decisions WHERE order_id = $1 AND idx = $2', [orderId, index])).rowCount) {
        throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'This visit is already decided' });
      }
      const visits: SubstituteVisit[] = [];
      for (const p of pick.visits) {
        const v = o.visits[p.index];
        if (!v) throw new ConflictException({ code: 'VISIT_NOT_MOVABLE', message: 'Visit not found' });
        if (!canMove((await this.runs.of(orderId, p.index, client)).status)) throw new ConflictException({ code: 'VISIT_NOT_MOVABLE', message: `Visit ${p.index + 1} has started or ended; it cannot move` });
        if (visitTime({ date: v.date, start: Math.min(v.start, p.start) }).getTime() <= now.getTime()) throw new ConflictException({ code: 'VISIT_NOT_MOVABLE', message: `Visit ${p.index + 1} is too soon to move` });
        visits.push({ index: p.index, date: v.date, start: v.start, newStart: p.start });
      }
      const fit = await this.fitting(o, pick.visits);
      const c = fit.find((x) => x.id === pick.caregiverId);
      if (!c) throw new ConflictException({ code: 'CAREGIVER_NOT_FREE', message: 'This caregiver is not free or does not fit these visits' });
      const ins = await client.query<{ id: string }>(
        `INSERT INTO substitutes (order_id, idx, caregiver_id, from_caregiver_id, visits, reason, admin_username, answer_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING id`,
        [orderId, index, c.id, o.caregiver_id, JSON.stringify(visits), pick.reason, admin.username, answerBy(now, visits)],
      );
      if (!ins.rows[0]) throw new ConflictException({ code: 'SUBSTITUTE_WAITING', message: 'A substitute is already waiting for the owner' });
      await this.history.record(client, { entity: 'substitute', entityId: Number(ins.rows[0].id), from: null, to: 'waiting', actor: { type: 'admin', id: admin.username }, reason: `Offered ${c.displayName} for ${visits.length} visit(s) of ${o.number}` });
      await this.messages.send(client, {
        userId: o.owner_id,
        role: 'owner',
        category: 'order',
        title: 'A substitute caregiver for you to approve',
        body: `Order ${o.number}: we found ${c.displayName} to take ${visits.length === 1 ? 'visit' : 'visits'} ${visits.map((v) => v.index + 1).join(', ')}. Nothing changes unless you approve. Price unchanged.`,
        link: { type: 'order', id: orderId },
      });
    });
    return (await this.exceptions.offerOf(orderId))!;
  }

  /** O20: the latest offer on the owner's order. */
  async forOwner(user: User, orderId: number): Promise<SubstituteOffer | null> {
    await this.owned(user, orderId);
    return this.exceptions.offerOf(orderId);
  }

  /** R52-4: the visits move to a new order with the new caregiver; the old caregiver loses them; both are told. */
  async approve(user: User, orderId: number, now = new Date()): Promise<SubstituteOffer> {
    await this.owned(user, orderId);
    await this.db.tx(async (client) => {
      const s = await this.waiting(client, orderId, now);
      const o = await this.order(client, orderId, true);
      for (const v of s.visits) {
        if (!canMove((await this.runs.of(orderId, v.index, client)).status)) throw new ConflictException({ code: 'VISIT_NOT_MOVABLE', message: `Visit ${v.index + 1} has changed; contact us on WhatsApp` });
      }
      // The new caregiver must still be free (they may have taken other work since).
      const fit = await this.fitting(o, s.visits.map((v) => ({ index: v.index, start: v.newStart })));
      const c = fit.find((x) => x.id === s.caregiver_id);
      if (!c) throw new ConflictException({ code: 'CAREGIVER_NOT_FREE', message: 'This caregiver is no longer free. We will contact you with another option.' });

      // A new order for the moved visits, paid by the same charge.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('order_number'))");
      const prefix = orderNumber(now, 0).slice(0, -3);
      const seq = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders WHERE number LIKE $1', [`${prefix}%`]);
      const number = orderNumber(now, seq.rows[0].n + 1);
      const moved = s.visits.map((v) => {
        const old = o.visits[v.index];
        return { ...old, start: v.newStart, label: visitWhen({ date: old.date, start: v.newStart }) };
      });
      const total = moved.reduce((sum, v) => sum + v.quote.total, 0);
      const paid = moved.reduce((sum, v) => sum + (v.paidSen ?? v.quote.total), 0);
      const n = await client.query<{ id: string }>(
        `INSERT INTO orders (number, owner_id, caregiver_id, status, level, overtime_units, address_id, pets, visits, total_sen, rules_version, entry_method, entry_secret,
           health_confirmed_at, charge_id, paid_at, accepted_at, discount_sen, substitute_of)
         VALUES ($1, $2, $3, 'accepted', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), $16, $17) RETURNING id`,
        [number, o.owner_id, c.id, o.level, o.overtime_units, o.address_id, JSON.stringify(o.pets), JSON.stringify(moved), total, o.rules_version, o.entry_method, o.entry_secret,
          o.health_confirmed_at, o.charge_id, o.paid_at, total - paid, orderId],
      );
      const newId = Number(n.rows[0].id);
      const pets = o.pets.map((p) => p.name).join(', ');
      for (const v of s.visits) {
        const old = o.visits[v.index];
        await client.query(
          `INSERT INTO visit_runs (order_id, idx, status, moved_to) VALUES ($1, $2, 'moved', $3)
           ON CONFLICT (order_id, idx) DO UPDATE SET status = 'moved', moved_to = $3, updated_at = now()`,
          [orderId, v.index, newId],
        );
        await client.query("DELETE FROM booked_visits WHERE order_id = $1 AND source = 'order' AND visit_date = $2 AND start_min = $3", [orderId, old.date, old.start]);
      }
      for (const v of moved) {
        await client.query("INSERT INTO booked_visits (caregiver_id, visit_date, start_min, minutes, label, source, order_id) VALUES ($1, $2, $3, $4, $5, 'order', $6)", [
          c.id, v.date, v.start, v.quote.totalMinutes, `${number} · ${pets}`.slice(0, 80), newId,
        ]);
      }
      await client.query("UPDATE substitutes SET status = 'approved', decided_at = now(), new_order_id = $2 WHERE id = $1", [s.id, newId]);
      const text = substituteApprovedText(c.displayName, s.visits.length);
      await this.exceptions.markDecided(client, orderId, s.idx, text);
      const owner: Actor = { type: 'owner', id: String(user.id) };
      await this.history.record(client, { entity: 'substitute', entityId: Number(s.id), from: 'waiting', to: 'approved', actor: owner, reason: `Visits moved to order ${number}` });
      await this.history.record(client, { entity: 'order', entityId: newId, from: null, to: 'accepted', actor: owner, reason: `Substitute for order ${o.number}` });
      const list = s.visits.map((v) => v.index + 1).join(', ');
      await this.messages.send(client, { userId: o.owner_id, role: 'owner', category: 'order', title: 'Substitute approved', body: `Order ${o.number}: ${c.displayName} now takes visit ${list}, under order ${number}. Price unchanged.`, link: { type: 'order', id: newId } });
      await this.messages.send(client, { userId: o.caregiver_id, role: 'caregiver', category: 'order', title: `Visit ${list} moved to another caregiver`, body: `Order ${o.number}: visit ${list} ${s.visits.length === 1 ? 'is' : 'are'} no longer in your tasks.`, link: { type: 'request', id: orderId } });
      await this.messages.send(client, { userId: c.id, role: 'caregiver', category: 'order', title: 'New visits for you', body: `Order ${number}: ${moved.map((v) => visitWhen(v)).join(', ')}. Our team arranged this with the owner.`, link: { type: 'request', id: newId } });
    });
    return (await this.exceptions.offerOf(orderId))!;
  }

  /** R52-5: the affected visits are refunded in full. */
  async decline(user: User, orderId: number, now = new Date()): Promise<SubstituteOffer> {
    await this.owned(user, orderId);
    await this.end(orderId, 'declined', { type: 'owner', id: String(user.id) }, now);
    return (await this.exceptions.offerOf(orderId))!;
  }

  /** R52-5: offers past their answer time count as declined. Returns how many ended. */
  async expireDue(now = new Date()): Promise<number> {
    const { rows } = await this.db.pool.query<{ order_id: string }>("SELECT order_id FROM substitutes WHERE status = 'waiting' AND answer_by <= $1 ORDER BY answer_by", [now]);
    let n = 0;
    for (const r of rows) {
      try {
        await this.end(Number(r.order_id), 'expired', { type: 'system' }, now);
        n++;
      } catch (e) {
        this.log.error(`Substitute on order ${r.order_id} could not expire: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async end(orderId: number, to: 'declined' | 'expired', actor: Actor, now: Date): Promise<void> {
    const refunds: { index: number; money: number }[] = [];
    const o = await this.db.tx(async (client) => {
      const s = to === 'declined' ? await this.waiting(client, orderId, now) : await this.waiting(client, orderId, null);
      const row = await this.exceptions.lockOrder(client, orderId);
      await client.query('UPDATE substitutes SET status = $2, decided_at = now() WHERE id = $1', [s.id, to]);
      const reason = to === 'declined' ? 'The owner declined the substitute' : 'The owner did not answer the substitute offer in time';
      for (const v of s.visits) {
        if ((await this.runs.of(orderId, v.index, client)).status !== 'todo') continue;
        refunds.push({ index: v.index, money: await this.exceptions.closeVisit(client, row, v.index, { fault: 'no_substitute', refundPercent: 100, reason }, actor) });
      }
      await this.history.record(client, { entity: 'substitute', entityId: Number(s.id), from: 'waiting', to, actor, reason });
      return row;
    });
    for (const r of refunds) if (r.money > 0) await this.exceptions.sendRefund(orderId, o.number, o.charge_id, r.index, r.money);
  }

  private async waiting(client: PoolClient, orderId: number, now: Date | null): Promise<{ id: string; idx: number; caregiver_id: number; visits: SubstituteVisit[] }> {
    const { rows } = await client.query<{ id: string; idx: number; caregiver_id: number; visits: SubstituteVisit[]; late: boolean }>(
      "SELECT id, idx, caregiver_id, visits, answer_by <= $2 AS late FROM substitutes WHERE order_id = $1 AND status = 'waiting' FOR UPDATE",
      [orderId, now ?? new Date(8.64e15)],
    );
    const s = rows[0];
    if (!s) throw new ConflictException({ code: 'NO_SUBSTITUTE', message: 'There is no substitute waiting for your answer' });
    if (now && s.late) throw new ConflictException({ code: 'SUBSTITUTE_EXPIRED', message: 'The time to answer has passed; those visits are refunded' });
    return s;
  }

  private async fitting(o: FullOrder, visits: { index: number; start: number }[]) {
    const area = (await this.db.pool.query<{ area: Area }>('SELECT area FROM addresses WHERE id = $1', [o.address_id])).rows[0].area;
    const weights = await this.db.pool.query<{ id: string; weight_kg: string | null }>('SELECT id, weight_kg FROM pets WHERE id = ANY ($1)', [o.pets.map((p) => p.id)]);
    const pets = o.pets.map((p) => ({ ...p, status: 'approved' as const, weightKg: Number(weights.rows.find((w) => Number(w.id) === p.id)?.weight_kg ?? 0) }));
    const needs = bookingNeeds({ petIds: pets.map((p) => p.id), overtimeUnits: o.overtime_units } as Parameters<typeof bookingNeeds>[0], { pets }, area);
    const fit = (await this.trust.approvedCards()).filter((c) => c.id !== o.caregiver_id && c.id !== o.owner_id && fitsBooking(c, needs));
    const schedules = await this.schedules.forBookingMany(fit.map((c) => c.id));
    const wanted = visits.map((v) => ({ date: o.visits[v.index]?.date, start: v.start, minutes: o.visits[v.index]?.quote.totalMinutes ?? 0 })).filter((v) => v.date);
    return fit.filter((c) => wanted.every((v) => !clashingVisits([{ date: v.date, start: v.start }], v.minutes, schedules.get(c.id)!).length));
  }

  private async order(conn: Pick<PoolClient, 'query'>, id: number, lock = false): Promise<FullOrder> {
    const { rows } = await conn.query<FullOrder>(`SELECT * FROM orders WHERE id = $1 AND status = 'accepted'${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return rows[0];
  }

  private async owned(user: User, orderId: number): Promise<void> {
    const { rows } = await this.db.pool.query<{ owner_id: number }>('SELECT owner_id FROM orders WHERE id = $1', [orderId]);
    if (rows[0]?.owner_id !== user.id) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
  }
}

