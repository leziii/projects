import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROBLEM_KIND_LABEL,
  PROBLEM_RULES,
  RuleError,
  checkContact,
  problemProblem,
  type AdminProblemRow,
  type AdminUser,
  type ContactMethod,
  type ProblemKind,
  type ProblemReport,
  type ProblemStatus,
  type User,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME, imageType } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { RequestsService } from './requests.service';

/** "Siti Aminah" → "Siti A." */
const shortName = (full: string) => {
  const w = full.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0).toUpperCase()}.` : w[0];
};

/** The caregiver's words as one sentence for the owner's message: at most 120 characters, ending with a full stop. */
const sentence = (text: string) => {
  const t = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

/** Contact tries made before sending carry the time they were noted, within the last 12 h; otherwise now. */
const CONTACT_PAST_MS = 12 * 3_600_000;

interface ReportRow {
  id: string;
  order_id: string;
  number: string;
  idx: number;
  kind: ProblemKind;
  description: string;
  status: ProblemStatus;
  decision: string | null;
  created: string;
}

/** E12-1 S13 (round 49): the caregiver reports a problem; the owner is told; the admin reviews (and decides in E12-3). */
@Injectable()
export class ProblemsService {
  constructor(
    private readonly db: DbService,
    private readonly requests: RequestsService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    private readonly files: FileStore,
  ) {}

  /** R49-4: the caregiver's report on this visit, or null. */
  async forVisit(user: User, orderId: number, index: number): Promise<ProblemReport | null> {
    await this.requests.visit(user, orderId, index);
    return this.load(orderId, index);
  }

  /** R49-1 … R49-4: send the report; contact tries noted before sending come with it. Photos follow one by one. */
  async send(user: User, orderId: number, index: number, input: { kind?: unknown; description?: unknown; contacts?: unknown }, now = new Date()): Promise<ProblemReport> {
    const v = await this.requests.visit(user, orderId, index, now);
    const problem = problemProblem(input, v.status);
    if (problem) throw new RuleError(v.status === 'todo' || v.status === 'arrived' || v.status === 'in_service' || v.status === 'disputed' ? 'PROBLEM_INVALID' : 'CANNOT_REPORT', problem);
    const raw = Array.isArray(input.contacts) ? (input.contacts as { method?: unknown; note?: unknown; at?: unknown }[]) : [];
    if (raw.length > PROBLEM_RULES.maxContacts) throw new RuleError('CONTACT_INVALID', `Up to ${PROBLEM_RULES.maxContacts} contact tries`);
    const contacts = raw.map((c) => {
      const at = typeof c.at === 'string' ? new Date(c.at) : null;
      const ok = at && !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() + 120_000 && at.getTime() >= now.getTime() - CONTACT_PAST_MS;
      return { ...checkContact(c), at: ok ? at : now };
    });
    const kind = input.kind as ProblemKind;
    const description = (input.description as string).trim();
    await this.db.tx(async (client) => {
      const r = await client.query<{ id: string }>(
        'INSERT INTO problem_reports (order_id, idx, caregiver_id, kind, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id',
        [orderId, index, user.id, kind, description],
      );
      if (!r.rows[0]) throw new ConflictException({ code: 'PROBLEM_OPEN', message: 'You already reported a problem on this visit; add to it instead' });
      const id = r.rows[0].id;
      for (const c of contacts) await client.query('INSERT INTO problem_contacts (report_id, method, note, at) VALUES ($1, $2, $3, $4)', [id, c.method, c.note, c.at]);
      await this.history.record(client, { entity: 'problem', entityId: Number(id), from: null, to: 'sent', actor: { type: 'caregiver', id: String(user.id) }, reason: `Caregiver reported on visit ${index + 1}: ${PROBLEM_KIND_LABEL[kind]}` });
      const o = await client.query<{ owner_id: number; display_name: string }>('SELECT o.owner_id, c.display_name FROM orders o JOIN caregiver_profiles c ON c.user_id = o.caregiver_id WHERE o.id = $1', [orderId]);
      const name = shortName(o.rows[0].display_name);
      await this.messages.send(client, {
        userId: o.rows[0].owner_id,
        role: 'owner',
        category: 'dispute',
        title: `${name} reported a problem: ${PROBLEM_KIND_LABEL[kind]}`,
        body: `Order ${v.number}, visit ${index + 1}: ${sentence(description)} Our team will look at it and may contact you.`,
        link: { type: 'order', id: orderId },
      });
    });
    return (await this.load(orderId, index))!;
  }

  /** R49-2, R49-4: one more photo while the report is open (JPEG or PNG, up to 6). */
  async addPhoto(user: User, orderId: number, index: number, data: Buffer | undefined): Promise<ProblemReport> {
    const r = await this.open(user, orderId, index);
    if (!data) throw new BadRequestException({ code: 'PHOTO_MISSING', message: 'Choose a photo' });
    const type = imageType(data);
    if (type !== 'jpg' && type !== 'png') throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use a JPEG or PNG photo' });
    if (r.photos.length >= PROBLEM_RULES.maxPhotos) throw new ConflictException({ code: 'TOO_MANY_PHOTOS', message: `Up to ${PROBLEM_RULES.maxPhotos} photos` });
    const key = await this.files.save('problems', data, type);
    await this.db.pool.query('INSERT INTO problem_photos (report_id, file_key) VALUES ($1, $2)', [r.id, key]);
    return (await this.load(orderId, index))!;
  }

  /** R49-3, R49-4: one more contact try while the report is open; the time is now. */
  async addContact(user: User, orderId: number, index: number, input: { method?: unknown; note?: unknown }): Promise<ProblemReport> {
    const r = await this.open(user, orderId, index);
    const c = checkContact(input);
    if (r.contacts.length >= PROBLEM_RULES.maxContacts) throw new ConflictException({ code: 'TOO_MANY_CONTACTS', message: `Up to ${PROBLEM_RULES.maxContacts} contact tries` });
    await this.db.pool.query('INSERT INTO problem_contacts (report_id, method, note) VALUES ($1, $2, $3)', [r.id, c.method, c.note]);
    return (await this.load(orderId, index))!;
  }

  async photo(user: User, orderId: number, index: number, photoId: number): Promise<{ data: Buffer; mime: string }> {
    const r = await this.forVisit(user, orderId, index);
    const { rows } = await this.db.pool.query<{ file_key: string }>('SELECT file_key FROM problem_photos WHERE id = $1 AND report_id = $2', [photoId, r?.id ?? 0]);
    if (!rows[0]) throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Photo not found' });
    return { data: await this.files.read(rows[0].file_key), mime: IMAGE_MIME[rows[0].file_key.split('.').pop() as 'jpg' | 'png'] };
  }

  /** Admin Cases page: caregiver reports, newest first. */
  async adminList(): Promise<AdminProblemRow[]> {
    const { rows } = await this.db.pool.query<ReportRow & { display_name: string; photos: number; contacts: number }>(
      `SELECT r.id, r.order_id, o.number, r.idx, r.kind, r.description, r.status, r.decision, ${ts('r.created_at')} AS created, c.display_name,
         (SELECT count(*)::int FROM problem_photos p WHERE p.report_id = r.id) AS photos,
         (SELECT count(*)::int FROM problem_contacts k WHERE k.report_id = r.id) AS contacts
       FROM problem_reports r JOIN orders o ON o.id = r.order_id JOIN caregiver_profiles c ON c.user_id = r.caregiver_id
       ORDER BY r.id DESC LIMIT 200`,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      orderId: Number(r.order_id),
      number: r.number,
      visit: r.idx + 1,
      caregiver: shortName(r.display_name),
      kind: r.kind,
      description: r.description,
      photos: r.photos,
      contacts: r.contacts,
      status: r.status,
      createdAt: r.created,
    }));
  }

  /** R49-4: admin starts on it; the caregiver sees "Under review". */
  async startReview(admin: AdminUser, id: number): Promise<AdminProblemRow[]> {
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ order_id: string; idx: number; caregiver_id: number; number: string }>(
        `UPDATE problem_reports r SET status = 'reviewing', reviewing_at = now() FROM orders o
         WHERE r.id = $1 AND r.status = 'sent' AND o.id = r.order_id RETURNING r.order_id, r.idx, r.caregiver_id, o.number`,
        [id],
      );
      if (!rows[0]) throw new ConflictException({ code: 'PROBLEM_NOT_NEW', message: 'This report is already under review' });
      const r = rows[0];
      await this.history.record(client, { entity: 'problem', entityId: id, from: 'sent', to: 'reviewing', actor: { type: 'admin', id: admin.username }, reason: 'Review started' });
      await this.messages.send(client, {
        userId: r.caregiver_id,
        role: 'caregiver',
        category: 'dispute',
        title: `We are reviewing your report on visit ${r.idx + 1}`,
        body: `Order ${r.number}: our team is reviewing the problem you reported. We will message you with the decision.`,
        link: { type: 'request', id: Number(r.order_id) },
      });
    });
    return this.adminList();
  }

  private async open(user: User, orderId: number, index: number): Promise<ProblemReport> {
    const r = await this.forVisit(user, orderId, index);
    if (!r) throw new NotFoundException({ code: 'PROBLEM_NOT_FOUND', message: 'Report the problem first' });
    if (r.status === 'decided') throw new ConflictException({ code: 'PROBLEM_DECIDED', message: 'This report is decided and closed' });
    return r;
  }

  private async load(orderId: number, index: number): Promise<ProblemReport | null> {
    const { rows } = await this.db.pool.query<ReportRow>(
      `SELECT r.id, r.order_id, o.number, r.idx, r.kind, r.description, r.status, r.decision, ${ts('r.created_at')} AS created
       FROM problem_reports r JOIN orders o ON o.id = r.order_id WHERE r.order_id = $1 AND r.idx = $2`,
      [orderId, index],
    );
    const r = rows[0];
    if (!r) return null;
    const photos = await this.db.pool.query<{ id: string }>('SELECT id FROM problem_photos WHERE report_id = $1 ORDER BY id', [r.id]);
    const contacts = await this.db.pool.query<{ id: string; method: ContactMethod; note: string; at: string }>(
      `SELECT id, method, note, ${ts('at')} AS at FROM problem_contacts WHERE report_id = $1 ORDER BY at, id`,
      [r.id],
    );
    return {
      id: Number(r.id),
      orderId: Number(r.order_id),
      number: r.number,
      index: r.idx,
      kind: r.kind,
      description: r.description,
      photos: photos.rows.map((p) => Number(p.id)),
      contacts: contacts.rows.map((c) => ({ id: Number(c.id), method: c.method, note: c.note, at: c.at })),
      status: r.status,
      decision: r.decision,
      createdAt: r.created,
    };
  }
}
