import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CASE_KIND_LABEL,
  CASE_RULES,
  PROBLEM_KIND_LABEL,
  REPORT_RULES,
  RuleError,
  caseKindsFor,
  checkCase,
  checkCaseNote,
  visitWhen,
  type Actor,
  type AdminCaseRow,
  type AdminUser,
  type CaseKind,
  type CaseStatus,
  type ProblemKind,
  type User,
  type VisitCase,
  type VisitReport,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME, imageType } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { OrdersService } from './orders.service';

const SYSTEM: Actor = { type: 'system' };
const AUTO_EVERY_MS = 60_000;

/** E9-2 (round 40): the owner confirms a visit's report, 12 h pass, or the owner raises a problem (a case). */
@Injectable()
export class CasesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CasesService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DbService,
    private readonly orders: OrdersService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly files: FileStore,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Tests run the check themselves; ORDER_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ORDER_WORKER') === 'off') return;
    // R40-2: reports left 12 h are confirmed within a minute.
    this.timer = setInterval(() => void this.autoConfirmDue().catch((e: Error) => this.log.error(e.message)), AUTO_EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** R40-1: "Confirm, all good". Only while the report waits; cannot be undone. */
  async confirm(user: User, id: number, index: number): Promise<VisitReport> {
    const r = await this.orders.report(user, id, index);
    await this.db.tx(async (client) => {
      if (!(await this.close(client, r, 'owner', { type: 'owner', id: String(user.id) }))) throw this.notWaiting(r.status);
    });
    return this.orders.report(user, id, index);
  }

  /** R40-2: every report left 12 h without an answer is confirmed. One update claims each visit. */
  async autoConfirmDue(): Promise<number> {
    const { rows } = await this.db.pool.query<{ order_id: string; idx: number }>(
      `SELECT order_id, idx FROM visit_runs WHERE status = 'report_sent' AND reported_at <= now() - interval '${REPORT_RULES.confirmHours} hours' ORDER BY reported_at`,
    );
    let n = 0;
    for (const r of rows) {
      try {
        const done = await this.db.tx(async (client) => {
          const o = await this.reportFacts(client, Number(r.order_id), r.idx);
          return this.close(client, o, 'auto', SYSTEM);
        });
        if (done) n++;
      } catch (e) {
        this.log.error(`Could not confirm visit ${r.idx + 1} of order ${r.order_id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  /**
   * R40-3, R50-1: the owner raises a problem. On a waiting report the 12 h clock stops and the visit is under review;
   * before the report the visit goes on, and the report goes straight to review when it is sent.
   */
  async raise(user: User, id: number, index: number, input: { kind?: unknown; description?: unknown }, photos: Buffer[]): Promise<VisitCase> {
    const v = await this.orders.ownVisit(user, id, index);
    const fields = checkCase(input);
    if (photos.length > CASE_RULES.maxPhotos) throw new BadRequestException({ code: 'TOO_MANY_PHOTOS', message: `Up to ${CASE_RULES.maxPhotos} photos` });
    const types = photos.map((p) => imageType(p));
    if (types.some((t) => t !== 'jpg' && t !== 'png')) throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use JPEG or PNG photos' });
    const kinds = caseKindsFor(v.orderStatus, v.run.status);
    if (v.run.status === 'disputed') throw this.notWaiting('disputed');
    if (!kinds.length) throw v.run.status === 'confirmed' ? this.notWaiting('confirmed') : new ConflictException({ code: 'CANNOT_RAISE', message: 'A problem cannot be raised on this visit' });
    if (!kinds.includes(fields.kind)) throw new RuleError('CASE_INVALID', fields.kind === 'report' ? 'Report problem is for a sent report' : 'Choose what went wrong');
    const keys = await Promise.all(photos.map((p, i) => this.files.save('cases', p, types[i] as 'jpg' | 'png')));
    const onReport = v.run.status === 'report_sent';
    await this.db.tx(async (client) => {
      if (onReport) {
        const { rowCount } = await client.query(
          "UPDATE visit_runs SET status = 'disputed', updated_at = now() WHERE order_id = $1 AND idx = $2 AND status = 'report_sent'",
          [id, index],
        );
        if (!rowCount) throw this.notWaiting((await client.query<{ status: VisitReport['status'] }>('SELECT status FROM visit_runs WHERE order_id = $1 AND idx = $2', [id, index])).rows[0].status);
      }
      const c = await client.query<{ id: string }>(
        'INSERT INTO cases (order_id, idx, owner_id, kind, description, on_report) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id',
        [id, index, user.id, fields.kind, fields.description, onReport],
      );
      if (!c.rows[0]) throw this.notWaiting('disputed');
      for (const key of keys) await client.query('INSERT INTO case_photos (case_id, file_key) VALUES ($1, $2)', [c.rows[0].id, key]);
      const reason = `Problem raised on visit ${index + 1}: ${CASE_KIND_LABEL[fields.kind]}`;
      const actor: Actor = { type: 'owner', id: String(user.id) };
      if (onReport) await this.history.record(client, { entity: 'visit', entityId: id, from: 'report_sent', to: 'disputed', actor, reason });
      else await this.history.record(client, { entity: 'case', entityId: Number(c.rows[0].id), from: null, to: 'sent', actor, reason });
      const cg = await client.query<{ caregiver_id: number }>('SELECT caregiver_id FROM orders WHERE id = $1', [id]);
      await this.messages.send(client, {
        userId: cg.rows[0].caregiver_id,
        role: 'caregiver',
        category: 'dispute',
        title: `Problem raised on visit ${index + 1}`,
        body: `Order ${v.number}: the owner raised a problem (${CASE_KIND_LABEL[fields.kind]}) about ${visitWhen(v)}. Our team will review it and may contact you.`,
        link: { type: 'request', id },
      });
    });
    return this.caseOf(user, id, index);
  }

  /** R40-6, R50-2: the owner follows the case on O18, with the caregiver's own report on the visit if any. */
  async caseOf(user: User, id: number, index: number): Promise<VisitCase> {
    const v = await this.orders.ownVisit(user, id, index);
    const { rows } = await this.db.pool.query<{ id: string; kind: CaseKind; description: string; status: CaseStatus; created: string; reviewing: string | null; decided: string | null; decision: string | null }>(
      `SELECT id, kind, description, status, ${ts('created_at')} AS created, ${ts('reviewing_at')} AS reviewing, ${ts('decided_at')} AS decided, decision
       FROM cases WHERE order_id = $1 AND idx = $2`,
      [id, index],
    );
    const c = rows[0];
    if (!c) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'No problem was raised for this visit' });
    const photos = await this.db.pool.query<{ id: string }>('SELECT id FROM case_photos WHERE case_id = $1 ORDER BY id', [c.id]);
    const notes = await this.db.pool.query<{ id: string; body: string; at: string }>(`SELECT id, body, ${ts('created_at')} AS at FROM case_notes WHERE case_id = $1 ORDER BY id`, [c.id]);
    const cg = await this.db.pool.query<{ kind: ProblemKind; at: string }>(`SELECT kind, ${ts('created_at')} AS at FROM problem_reports WHERE order_id = $1 AND idx = $2`, [id, index]);
    return {
      id: Number(c.id),
      orderId: id,
      number: v.number,
      index,
      kind: c.kind,
      description: c.description,
      photos: photos.rows.map((p) => Number(p.id)),
      status: c.status,
      createdAt: c.created,
      reviewingAt: c.reviewing,
      decidedAt: c.decided,
      decision: c.decision,
      notes: notes.rows.map((n) => ({ id: Number(n.id), body: n.body, at: n.at })),
      caregiverReport: cg.rows[0] ? { kind: PROBLEM_KIND_LABEL[cg.rows[0].kind], at: cg.rows[0].at } : null,
    };
  }

  /** R50-4: one more photo while the case is open (JPEG or PNG, up to 3 in all). */
  async addPhoto(user: User, id: number, index: number, data: Buffer | undefined): Promise<VisitCase> {
    const c = await this.openCase(user, id, index);
    if (!data) throw new BadRequestException({ code: 'PHOTO_MISSING', message: 'Choose a photo' });
    const type = imageType(data);
    if (type !== 'jpg' && type !== 'png') throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use a JPEG or PNG photo' });
    if (c.photos.length >= CASE_RULES.maxPhotos) throw new ConflictException({ code: 'TOO_MANY_PHOTOS', message: `Up to ${CASE_RULES.maxPhotos} photos` });
    const key = await this.files.save('cases', data, type);
    await this.db.pool.query('INSERT INTO case_photos (case_id, file_key) VALUES ($1, $2)', [c.id, key]);
    return this.caseOf(user, id, index);
  }

  /** R50-4: one more note while the case is open. */
  async addNote(user: User, id: number, index: number, body: unknown): Promise<VisitCase> {
    const c = await this.openCase(user, id, index);
    const text = checkCaseNote(body);
    if (c.notes.length >= CASE_RULES.maxNotes) throw new ConflictException({ code: 'TOO_MANY_NOTES', message: `Up to ${CASE_RULES.maxNotes} notes` });
    await this.db.pool.query('INSERT INTO case_notes (case_id, body) VALUES ($1, $2)', [c.id, text]);
    return this.caseOf(user, id, index);
  }

  private async openCase(user: User, id: number, index: number): Promise<VisitCase> {
    const c = await this.caseOf(user, id, index);
    if (c.status === 'decided') throw new ConflictException({ code: 'CASE_DECIDED', message: 'This case is decided; for help, use WhatsApp support' });
    return c;
  }

  async casePhoto(user: User, id: number, index: number, photoId: number): Promise<{ data: Buffer; mime: string }> {
    const c = await this.caseOf(user, id, index);
    const { rows } = await this.db.pool.query<{ file_key: string }>('SELECT file_key FROM case_photos WHERE id = $1 AND case_id = $2', [photoId, c.id]);
    if (!rows[0]) throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Photo not found' });
    return { data: await this.files.read(rows[0].file_key), mime: IMAGE_MIME[rows[0].file_key.split('.').pop() as 'jpg' | 'png'] };
  }

  /** R40-4: admin's case list, newest first; handling comes with E12-5. */
  async adminList(): Promise<AdminCaseRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; order_id: string; number: string; idx: number; kind: CaseKind; description: string; photos: number; status: CaseStatus; created: string }>(
      `SELECT c.id, c.order_id, o.number, c.idx, c.kind, c.description, c.status, ${ts('c.created_at')} AS created,
         (SELECT count(*)::int FROM case_photos p WHERE p.case_id = c.id) AS photos
       FROM cases c JOIN orders o ON o.id = c.order_id ORDER BY c.id DESC LIMIT 200`,
    );
    return rows.map((c) => ({
      id: Number(c.id),
      orderId: Number(c.order_id),
      number: c.number,
      visit: c.idx + 1,
      kind: c.kind,
      description: c.description,
      photos: c.photos,
      status: c.status,
      createdAt: c.created,
      payoutHeld: true,
    }));
  }

  /** R40-6: admin starts on the case; the owner sees "Under review". */
  async startReview(admin: AdminUser, caseId: number): Promise<AdminCaseRow[]> {
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ order_id: string; idx: number; owner_id: number; number: string }>(
        `UPDATE cases c SET status = 'reviewing', reviewing_at = now() FROM orders o
         WHERE c.id = $1 AND c.status = 'sent' AND o.id = c.order_id RETURNING c.order_id, c.idx, c.owner_id, o.number`,
        [caseId],
      );
      if (!rows[0]) throw new ConflictException({ code: 'CASE_NOT_NEW', message: 'This case is already under review' });
      const c = rows[0];
      await this.history.record(client, { entity: 'case', entityId: caseId, from: 'sent', to: 'reviewing', actor: { type: 'admin', id: admin.username }, reason: 'Review started' });
      // A case raised before the report has no report to link to: the order instead.
      const run = (await client.query<{ id: string }>('SELECT id FROM visit_runs WHERE order_id = $1 AND idx = $2 AND reported_at IS NOT NULL', [c.order_id, c.idx])).rows[0];
      await this.messages.send(client, {
        userId: c.owner_id,
        role: 'owner',
        category: 'dispute',
        title: `We are reviewing visit ${c.idx + 1}`,
        body: `Order ${c.number}: our team is now reviewing the problem you raised. We will message you with the decision.`,
        link: run ? { type: 'report', id: Number(run.id) } : { type: 'order', id: Number(c.order_id) },
      });
    });
    return this.adminList();
  }

  /** R40-1, R40-2: report_sent → confirmed, and the caregiver is told. False when the report no longer waits. */
  private async close(client: PoolClient, r: Pick<VisitReport, 'orderId' | 'index' | 'number' | 'date' | 'start'>, by: 'owner' | 'auto', actor: Actor): Promise<boolean> {
    const due = by === 'auto' ? `AND reported_at <= now() - interval '${REPORT_RULES.confirmHours} hours'` : '';
    const { rowCount } = await client.query(
      `UPDATE visit_runs SET status = 'confirmed', confirmed_at = now(), confirmed_by = $3, updated_at = now() WHERE order_id = $1 AND idx = $2 AND status = 'report_sent' ${due}`,
      [r.orderId, r.index, by],
    );
    if (!rowCount) return false;
    await this.history.record(client, {
      entity: 'visit',
      entityId: r.orderId,
      from: 'report_sent',
      to: 'confirmed',
      actor,
      reason: by === 'owner' ? `Owner confirmed visit ${r.index + 1}` : `Visit ${r.index + 1} confirmed automatically after ${REPORT_RULES.confirmHours} h`,
    });
    const cg = await client.query<{ caregiver_id: number }>('SELECT caregiver_id FROM orders WHERE id = $1', [r.orderId]);
    await this.messages.send(client, {
      userId: cg.rows[0].caregiver_id,
      role: 'caregiver',
      category: 'order',
      title: `Visit ${r.index + 1} confirmed`,
      body: `Order ${r.number}: the report for ${visitWhen(r)} was ${by === 'owner' ? 'confirmed by the owner' : `confirmed automatically after ${REPORT_RULES.confirmHours} h`}.`,
      link: { type: 'request', id: r.orderId },
    });
    return true;
  }

  private async reportFacts(client: PoolClient, orderId: number, index: number): Promise<Pick<VisitReport, 'orderId' | 'index' | 'number' | 'date' | 'start'>> {
    const { rows } = await client.query<{ number: string; visits: { date: string; start: number }[] }>('SELECT number, visits FROM orders WHERE id = $1', [orderId]);
    const v = rows[0].visits[index];
    return { orderId, index, number: rows[0].number, date: v.date, start: v.start };
  }

  private notWaiting(status: VisitReport['status']) {
    return status === 'confirmed'
      ? new ConflictException({ code: 'ALREADY_CONFIRMED', message: 'This visit is already confirmed' })
      : new ConflictException({ code: 'CASE_OPEN', message: 'A problem is already raised for this visit' });
  }
}
