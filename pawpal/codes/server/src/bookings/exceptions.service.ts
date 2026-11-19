import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CASE_KIND_LABEL,
  PROBLEM_KIND_LABEL,
  checkDecision,
  creditShares,
  decisionRefundSen,
  decisionText,
  formatRM,
  visitWhen,
  type AdminExceptionRow,
  type Actor,
  type AdminUser,
  type CaseKind,
  type ContactMethod,
  type ExceptionDetail,
  type Fault,
  type OrderVisit,
  type ProblemKind,
  type SubstituteOffer,
  type SubstituteStatus,
  type SubstituteVisit,
  type VisitDecision,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { TrustService } from '../caregivers/trust.service';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { VisitRunsService } from './visit-runs.service';

/** Visits with a problem raised before the report: a caregiver report (not dispute evidence) or an owner case. */
const EXCEPTIONS = `
  SELECT order_id, idx FROM problem_reports WHERE kind <> 'dispute_evidence'
  UNION SELECT order_id, idx FROM cases WHERE NOT on_report`;

export interface OrderRow {
  id: string;
  number: string;
  owner_id: number;
  caregiver_id: number;
  visits: OrderVisit[];
  credit_sen: number;
  charge_id: string | null;
  display_name: string;
}

/** E12-3 A09 / A10 (round 51): the exception queue, both sides' evidence, and the admin's decision with its refund. */
@Injectable()
export class ExceptionsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ExceptionsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly runs: VisitRunsService,
    private readonly payments: PaymentsService,
    private readonly referrals: ReferralsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly files: FileStore,
    private readonly config: ConfigService,
    private readonly trust: TrustService,
  ) {}

  onModuleInit() {
    // Tests run the retry themselves; ORDER_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R51-4: decision refunds that could not start are tried again every 5 minutes, like cancel refunds (R43-4).
    this.timer = setInterval(() => void this.retryRefunds().catch((e: Error) => this.log.error(e.message)), 5 * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R51-1: newest first; open ones before decided ones. */
  async list(): Promise<AdminExceptionRow[]> {
    const { rows } = await this.db.pool.query<{
      order_id: string; idx: number; number: string; visits: OrderVisit[]; cg_kind: ProblemKind | null; owner_kind: CaseKind | null; fault: Fault | null; substitute: SubstituteStatus | null; created: string;
    }>(
      `SELECT e.order_id, e.idx, o.number, o.visits, p.kind AS cg_kind, c.kind AS owner_kind, d.fault,
         (SELECT s.status FROM substitutes s WHERE s.order_id = e.order_id AND s.idx = e.idx ORDER BY s.id DESC LIMIT 1) AS substitute,
         ${ts('LEAST(COALESCE(p.created_at, c.created_at), COALESCE(c.created_at, p.created_at))')} AS created
       FROM (${EXCEPTIONS}) e
       JOIN orders o ON o.id = e.order_id
       LEFT JOIN problem_reports p ON p.order_id = e.order_id AND p.idx = e.idx AND p.kind <> 'dispute_evidence'
       LEFT JOIN cases c ON c.order_id = e.order_id AND c.idx = e.idx AND NOT c.on_report
       LEFT JOIN visit_decisions d ON d.order_id = e.order_id AND d.idx = e.idx
       ORDER BY (d.id IS NULL AND NOT EXISTS (SELECT 1 FROM substitutes s WHERE s.order_id = e.order_id AND s.idx = e.idx AND s.status = 'approved')) DESC, created DESC LIMIT 200`,
    );
    return rows.map((r) => {
      const v = r.visits[r.idx];
      return {
        orderId: Number(r.order_id),
        number: r.number,
        index: r.idx,
        date: v.date,
        start: v.start,
        from: r.cg_kind && r.owner_kind ? 'both' : r.cg_kind ? 'caregiver' : 'owner',
        kinds: [r.cg_kind && PROBLEM_KIND_LABEL[r.cg_kind], r.owner_kind && CASE_KIND_LABEL[r.owner_kind]].filter((k): k is string => !!k),
        status: r.fault || r.substitute === 'approved' ? 'decided' : r.substitute === 'waiting' ? 'offered' : 'open',
        substitute: r.substitute,
        fault: r.fault,
        createdAt: r.created,
      };
    });
  }

  /** R51-2: both sides' evidence and the visit facts. */
  async detail(orderId: number, index: number): Promise<ExceptionDetail> {
    const o = await this.exceptionOrder(orderId, index);
    const v = o.visits[index];
    const run = await this.runs.of(orderId, index);
    const flag = await this.db.pool.query<{ flag: string }>('SELECT flag FROM location_checks WHERE order_id = $1 AND idx = $2 AND flag IS NOT NULL ORDER BY id LIMIT 1', [orderId, index]);
    const p = (await this.db.pool.query<{ id: string; kind: ProblemKind; description: string; created: string }>(
      `SELECT id, kind, description, ${ts('created_at')} AS created FROM problem_reports WHERE order_id = $1 AND idx = $2 AND kind <> 'dispute_evidence'`,
      [orderId, index],
    )).rows[0];
    const c = (await this.db.pool.query<{ id: string; kind: CaseKind; description: string; created: string }>(
      `SELECT id, kind, description, ${ts('created_at')} AS created FROM cases WHERE order_id = $1 AND idx = $2 AND NOT on_report`,
      [orderId, index],
    )).rows[0];
    const ids = async (sql: string, id: string) => (await this.db.pool.query<{ id: string }>(sql, [id])).rows.map((r) => Number(r.id));
    return {
      orderId,
      number: o.number,
      index,
      date: v.date,
      start: v.start,
      caregiver: o.display_name,
      paidSen: paidOf(v),
      run: { status: run.status, arrivedAt: run.arrivedAt, enteredAt: run.enteredAt, waitingAt: run.waitingAt, reportedAt: run.reportedAt, locationFlag: flag.rows[0]?.flag ?? null },
      caregiverReport: p
        ? {
            id: Number(p.id),
            kind: PROBLEM_KIND_LABEL[p.kind],
            description: p.description,
            photos: await ids('SELECT id FROM problem_photos WHERE report_id = $1 ORDER BY id', p.id),
            contacts: (await this.db.pool.query<{ id: string; method: ContactMethod; note: string; at: string }>(`SELECT id, method, note, ${ts('at')} AS at FROM problem_contacts WHERE report_id = $1 ORDER BY at, id`, [p.id])).rows.map((r) => ({ id: Number(r.id), method: r.method, note: r.note, at: r.at })),
            createdAt: p.created,
          }
        : null,
      ownerCase: c
        ? {
            id: Number(c.id),
            kind: CASE_KIND_LABEL[c.kind],
            description: c.description,
            photos: await ids('SELECT id FROM case_photos WHERE case_id = $1 ORDER BY id', c.id),
            notes: (await this.db.pool.query<{ body: string; at: string }>(`SELECT body, ${ts('created_at')} AS at FROM case_notes WHERE case_id = $1 ORDER BY id`, [c.id])).rows,
            createdAt: c.created,
          }
        : null,
      decision: await this.decisionOf(orderId, index),
      visits: await Promise.all(o.visits.map(async (x, i) => ({ index: i, date: x.date, start: x.start, status: (await this.runs.of(orderId, i)).status }))),
      substitute: await this.offerOf(orderId),
    };
  }

  async photo(kind: 'problem' | 'case', photoId: number): Promise<{ data: Buffer; mime: string }> {
    const sql = kind === 'problem' ? 'SELECT file_key FROM problem_photos WHERE id = $1' : 'SELECT file_key FROM case_photos WHERE id = $1';
    const { rows } = await this.db.pool.query<{ file_key: string }>(sql, [photoId]);
    if (!rows[0]) throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Photo not found' });
    return { data: await this.files.read(rows[0].file_key), mime: IMAGE_MIME[rows[0].file_key.split('.').pop() as 'jpg' | 'png'] };
  }

  /**
   * R51-3 … R51-5: fault, refund and reason. The visit is closed, both reports are Decided with the same words, both
   * sides are told, and the refund goes out through the normal refund flow (credit first back as credit).
   */
  async decide(admin: AdminUser, orderId: number, index: number, input: { fault?: unknown; refundPercent?: unknown; reason?: unknown }): Promise<ExceptionDetail> {
    const d = checkDecision(input);
    const done = await this.db.tx(async (client) => {
      const o = await this.lockOrder(client, orderId);
      const isException = o?.visits[index] && (await client.query(`SELECT 1 FROM (${EXCEPTIONS}) e WHERE order_id = $1 AND idx = $2`, [orderId, index])).rowCount;
      if (!isException) throw new NotFoundException({ code: 'EXCEPTION_NOT_FOUND', message: 'No problem was raised on this visit' });
      if ((await client.query("SELECT 1 FROM substitutes WHERE order_id = $1 AND status = 'waiting'", [orderId])).rowCount) {
        throw new ConflictException({ code: 'SUBSTITUTE_WAITING', message: 'A substitute is waiting for the owner; wait for the answer' });
      }
      return { o, money: await this.closeVisit(client, o, index, d, { type: 'admin', id: admin.username }) };
    });
    if (done.money > 0) await this.sendRefund(orderId, done.o.number, done.o.charge_id, index, done.money);
    return this.detail(orderId, index);
  }

  /** The order, locked, with the caregiver's name. */
  async lockOrder(client: PoolClient, orderId: number): Promise<OrderRow> {
    return (await client.query<OrderRow>(
      `SELECT o.id, o.number, o.owner_id, o.caregiver_id, o.visits, o.credit_sen, o.charge_id, cp.display_name
       FROM orders o JOIN caregiver_profiles cp ON cp.user_id = o.caregiver_id WHERE o.id = $1 FOR UPDATE OF o`,
      [orderId],
    )).rows[0];
  }

  /**
   * R51-3 … R51-5, R52-5: closes one visit with a decision and its refund. Both reports on it become Decided with the
   * same words and both sides are told. Returns the money (not credit) to refund once the transaction is done.
   */
  async closeVisit(client: PoolClient, o: OrderRow, index: number, d: { fault: Fault; refundPercent: number; reason: string }, actor: Actor): Promise<number> {
    const orderId = Number(o.id);
    const v = o.visits[index];
    const run = await this.runs.of(orderId, index, client);
    if (run.status === 'cancelled') throw new ConflictException({ code: 'VISIT_CANCELLED', message: 'This visit was cancelled; nothing to decide' });
    if (run.status === 'confirmed') throw new ConflictException({ code: 'VISIT_CONFIRMED', message: 'The owner already confirmed this visit' });
    const refundSen = decisionRefundSen(paidOf(v), d.refundPercent);
    const credit = creditShares(o.visits.map(paidOf), o.credit_sen)[index];
    const creditSen = Math.min(refundSen, Math.round((credit * d.refundPercent) / 100));
    const ins = await client.query(
      `INSERT INTO visit_decisions (order_id, idx, fault, refund_percent, refund_sen, credit_sen, reason, admin_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [orderId, index, d.fault, d.refundPercent, refundSen, creditSen, d.reason, actor.type === 'admin' ? actor.id : 'system'],
    );
    if (!ins.rowCount) throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'This visit is already decided' });
    // R51-4: the visit is closed; a visit not started frees the caregiver's time.
    await client.query(
      `INSERT INTO visit_runs (order_id, idx, status, closed_at) VALUES ($1, $2, 'closed', now())
       ON CONFLICT (order_id, idx) DO UPDATE SET status = 'closed', closed_at = now(), updated_at = now()`,
      [orderId, index],
    );
    if (run.status === 'todo') await client.query("DELETE FROM booked_visits WHERE order_id = $1 AND source = 'order' AND visit_date = $2 AND start_min = $3", [orderId, v.date, v.start]);
    const text = decisionText({ fault: d.fault, refundSen, reason: d.reason });
    await this.markDecided(client, orderId, index, text);
    if (creditSen) await this.referrals.returnPart(client, orderId, creditSen);
    await this.history.record(client, { entity: 'visit', entityId: orderId, from: run.status, to: 'closed', actor, reason: `Visit ${index + 1} decided: ${text}` });
    const title = `Decision on visit ${index + 1}`;
    const body = `Order ${o.number}, ${visitWhen(v)}: ${text}`;
    await this.messages.send(client, { userId: o.owner_id, role: 'owner', category: 'dispute', title, body, link: { type: 'order', id: orderId } });
    await this.messages.send(client, { userId: o.caregiver_id, role: 'caregiver', category: 'dispute', title, body, link: { type: 'request', id: orderId } });
    return refundSen - creditSen;
  }

  /** R51-5, R52-4: the caregiver's report and the owner's case on the visit show Decided with these words. */
  async markDecided(client: PoolClient, orderId: number, index: number, text: string): Promise<void> {
    await client.query("UPDATE problem_reports SET status = 'decided', decided_at = now(), decision = $3 WHERE order_id = $1 AND idx = $2 AND status <> 'decided'", [orderId, index, text]);
    await client.query("UPDATE cases SET status = 'decided', decided_at = now(), decision = $3 WHERE order_id = $1 AND idx = $2 AND status <> 'decided'", [orderId, index, text]);
  }

  /** R51-4: decided visits whose money refund never started are tried again (with the cancel retries). */
  async retryRefunds(): Promise<number> {
    const { rows } = await this.db.pool.query<{ order_id: string; number: string; charge_id: string | null; idx: number; money: number }>(
      `SELECT d.order_id, o.number, o.charge_id, d.idx, d.refund_sen - d.credit_sen AS money
       FROM visit_decisions d JOIN orders o ON o.id = d.order_id
       WHERE d.refund_sen > d.credit_sen AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.ref = 'order-' || d.order_id || '-refund-x' || d.idx)
       ORDER BY d.id LIMIT 50`,
    );
    let started = 0;
    for (const r of rows) if (await this.sendRefund(Number(r.order_id), r.number, r.charge_id, r.idx, r.money)) started++;
    return started;
  }

  async sendRefund(orderId: number, number: string, chargeId: string | null, idx: number, money: number): Promise<boolean> {
    try {
      if (!chargeId) throw new Error('no paid charge');
      await this.payments.createRefund({ ref: `order-${orderId}-refund-x${idx}`, chargeId: Number(chargeId), amountSen: money });
      return true;
    } catch (e) {
      this.log.error(`Decision refund ${formatRM(money)} for order ${number} visit ${idx + 1} could not start, will retry: ${(e as Error).message}`);
      return false;
    }
  }

  private async exceptionOrder(orderId: number, index: number): Promise<OrderRow> {
    const { rows } = await this.db.pool.query<OrderRow>(
      `SELECT o.id, o.number, o.owner_id, o.caregiver_id, o.visits, o.credit_sen, o.charge_id, cp.display_name
       FROM orders o JOIN caregiver_profiles cp ON cp.user_id = o.caregiver_id
       WHERE o.id = $1 AND EXISTS (SELECT 1 FROM (${EXCEPTIONS}) e WHERE e.order_id = o.id AND e.idx = $2)`,
      [orderId, index],
    );
    if (!rows[0]?.visits[index]) throw new NotFoundException({ code: 'EXCEPTION_NOT_FOUND', message: 'No problem was raised on this visit' });
    return rows[0];
  }

  /** E12-4 (R52-3): the latest substitute offer on the order, as A10 and O20 show it. */
  async offerOf(orderId: number, conn: Pick<PoolClient, 'query'> = this.db.pool): Promise<SubstituteOffer | null> {
    const { rows } = await conn.query<{
      id: string; order_id: string; number: string; idx: number; caregiver_id: number; from_name: string; visits: SubstituteVisit[]; reason: string; status: SubstituteStatus;
      answer_by: string; created: string; new_order_id: string | null; new_number: string | null; cg_kind: ProblemKind | null; owner_kind: CaseKind | null;
    }>(
      `SELECT s.id, s.order_id, o.number, s.idx, s.caregiver_id, fp.display_name AS from_name, s.visits, s.reason, s.status,
         ${ts('s.answer_by')} AS answer_by, ${ts('s.created_at')} AS created, s.new_order_id, n.number AS new_number,
         (SELECT kind FROM problem_reports p WHERE p.order_id = s.order_id AND p.idx = s.idx) AS cg_kind,
         (SELECT kind FROM cases c WHERE c.order_id = s.order_id AND c.idx = s.idx) AS owner_kind
       FROM substitutes s JOIN orders o ON o.id = s.order_id JOIN caregiver_profiles fp ON fp.user_id = s.from_caregiver_id
       LEFT JOIN orders n ON n.id = s.new_order_id
       WHERE s.order_id = $1 ORDER BY s.id DESC LIMIT 1`,
      [orderId],
    );
    const r = rows[0];
    if (!r) return null;
    const card = (await this.trust.approvedCards([r.caregiver_id]))[0];
    return {
      id: Number(r.id),
      orderId: Number(r.order_id),
      number: r.number,
      status: r.status,
      caregiver: card
        ? { id: card.id, displayName: card.displayName, initials: card.initials, hasPhoto: card.hasPhoto, idVerified: card.idVerified, experienceYears: card.experienceYears }
        : { id: r.caregiver_id, displayName: 'Caregiver', initials: 'C', hasPhoto: false, idVerified: false, experienceYears: 0 },
      from: shortName(r.from_name),
      problem: r.cg_kind ? PROBLEM_KIND_LABEL[r.cg_kind] : r.owner_kind ? CASE_KIND_LABEL[r.owner_kind] : 'Problem',
      reason: r.reason,
      visits: r.visits,
      answerBy: r.answer_by,
      createdAt: r.created,
      newOrder: r.new_order_id ? { id: Number(r.new_order_id), number: r.new_number! } : null,
    };
  }

  private async decisionOf(orderId: number, index: number): Promise<VisitDecision | null> {
    const { rows } = await this.db.pool.query<{ fault: Fault; refund_percent: number; refund_sen: number; credit_sen: number; reason: string; admin_username: string; at: string }>(
      `SELECT fault, refund_percent, refund_sen, credit_sen, reason, admin_username, ${ts('created_at')} AS at FROM visit_decisions WHERE order_id = $1 AND idx = $2`,
      [orderId, index],
    );
    const r = rows[0];
    return r ? { fault: r.fault, refundPercent: r.refund_percent, refundSen: r.refund_sen, creditSen: r.credit_sen, reason: r.reason, admin: r.admin_username, at: r.at } : null;
  }
}

const paidOf = (v: OrderVisit) => v.paidSen ?? v.quote.total;

/** "Siti Aminah" → "Siti A." */
export const shortName = (full: string) => {
  const w = full.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0).toUpperCase()}.` : w[0];
};
