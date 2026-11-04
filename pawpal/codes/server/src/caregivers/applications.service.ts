import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import {
  APPLICATION_FILE_LABEL,
  APPLICATION_STATUS_LABEL,
  CARE_GUIDE,
  EDITABLE,
  FILE_LIMIT,
  REVIEW_FILTERS,
  appDecisionMessage,
  checkAppDecision,
  checkDraft,
  formatMyPhone,
  maskIc,
  missingItems,
  type Actor,
  type AdminUser,
  type Application,
  type ApplicationFields,
  type ApplicationFile,
  type ApplicationFileKind,
  type ApplicationInput,
  type ApplicationStatus,
  type CaregiverStatus,
  type DogSize,
  type ReviewRow,
  type SameIcAccount,
  type StatusChange,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME, type ImageType } from '../files/file-store';
import { SecretBox } from '../files/secret-box';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';

interface ApplicationRow {
  status: ApplicationStatus;
  full_name: string;
  ic_secret: string | null;
  experience_years: number | null;
  cats: boolean;
  dogs: boolean;
  max_dog_size: DogSize | null;
  areas: ApplicationFields['areas'];
  guide_version: string | null;
  admin_note: string | null;
  submitted: string | null;
  updated: string;
}

interface FileRow {
  id: number;
  kind: ApplicationFileKind;
  file_key: string;
}

/** Admin review detail (A04). The IC number is masked; the admin asks for the full number separately (R13-4). */
export interface ReviewDetail {
  userId: number;
  phone: string;
  application: Application;
  sameIc: SameIcAccount[];
  history: StatusChange[];
  icViews: StatusChange[];
}

const APP_ENTITY = 'caregiver_application';
const IC_VIEW_ENTITY = 'caregiver_ic_view';

const SELECT = `SELECT status, full_name, ic_secret, experience_years, cats, dogs, max_dog_size, areas, guide_version, admin_note,
  ${ts('submitted_at')} AS submitted, ${ts('updated_at')} AS updated FROM caregiver_applications`;

/** People who already are (or were made) caregivers cannot apply again here. */
const NO_APPLY: readonly CaregiverStatus[] = ['approved', 'suspended'];

/**
 * Caregiver application (E4-1, S02). One per account. The IC number is encrypted and the identity photos
 * are private (R12-4); the draft lives on the server (R12-5) and is locked once submitted.
 */
@Injectable()
export class ApplicationsService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly files: FileStore,
    private readonly secrets: SecretBox,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  /** Applications saved before the IC hash existed get one, so the same-IC check sees them. */
  async onModuleInit(): Promise<void> {
    const { rows } = await this.db.pool.query<{ user_id: number; ic_secret: string }>('SELECT user_id, ic_secret FROM caregiver_applications WHERE ic_secret IS NOT NULL AND ic_hash IS NULL');
    for (const r of rows) {
      await this.db.pool.query('UPDATE caregiver_applications SET ic_hash = $2 WHERE user_id = $1', [r.user_id, await this.secrets.hash(await this.secrets.open(r.ic_secret))]);
    }
  }

  /** The caller's application; an empty draft when they have not started. */
  async get(user: User): Promise<Application> {
    const row = await this.row(user.id);
    const files = await this.fileRows(user.id);
    if (!row) {
      const blank = checkDraft({}, new Date());
      return { ...blank, status: 'draft', files: [], missing: missingItems(blank, []), adminNote: null, submittedAt: null, updatedAt: '' };
    }
    return this.toApplication(row, files);
  }

  async save(user: User, input: ApplicationInput, now = new Date()): Promise<Application> {
    const a = checkDraft(input ?? {}, now);
    const ic = a.icNumber ? await this.secrets.seal(a.icNumber) : null;
    const icHash = a.icNumber ? await this.secrets.hash(a.icNumber) : null;
    await this.db.tx(async (client) => {
      await this.editable(client, user);
      await client.query(
        `UPDATE caregiver_applications SET full_name = $2, ic_secret = $3, experience_years = $4, cats = $5, dogs = $6, max_dog_size = $7,
           areas = $8, guide_version = $9, ic_hash = $10, updated_at = now() WHERE user_id = $1`,
        [user.id, a.fullName, ic, a.experienceYears, a.cats, a.dogs, a.maxDogSize, a.areas, a.guideRead ? CARE_GUIDE.version : null, icHash],
      );
    });
    return this.get(user);
  }

  /** Adds a photo. IC front/back and the selfie hold one each, so a new one replaces the old. */
  async addFile(user: User, kind: unknown, data: Buffer, type: ImageType): Promise<Application> {
    if (!Object.keys(FILE_LIMIT).includes(kind as string)) throw new BadRequestException({ code: 'FILE_KIND', message: 'Unknown document type' });
    const k = kind as ApplicationFileKind;
    const key = await this.files.save('caregiver', data, type);
    await this.db.tx(async (client) => {
      await this.editable(client, user);
      const { rows } = await client.query<{ id: number }>('SELECT id FROM caregiver_application_files WHERE user_id = $1 AND kind = $2 ORDER BY id', [user.id, k]);
      if (FILE_LIMIT[k] === 1) {
        await client.query('DELETE FROM caregiver_application_files WHERE user_id = $1 AND kind = $2', [user.id, k]);
      } else if (rows.length >= FILE_LIMIT[k]) {
        throw new ConflictException({ code: 'FILE_LIMIT', message: `Up to ${FILE_LIMIT[k]} ${APPLICATION_FILE_LABEL[k].toLowerCase()} photos` });
      }
      await client.query('INSERT INTO caregiver_application_files (user_id, kind, file_key) VALUES ($1, $2, $3)', [user.id, k, key]);
      await client.query('UPDATE caregiver_applications SET updated_at = now() WHERE user_id = $1', [user.id]);
    });
    return this.get(user);
  }

  async removeFile(user: User, id: number): Promise<Application> {
    await this.db.tx(async (client) => {
      await this.editable(client, user);
      const { rowCount } = await client.query('DELETE FROM caregiver_application_files WHERE id = $1 AND user_id = $2', [id, user.id]);
      if (!rowCount) throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'Photo not found' });
      await client.query('UPDATE caregiver_applications SET updated_at = now() WHERE user_id = $1', [user.id]);
    });
    return this.get(user);
  }

  /** The applicant sees their own photos; admins will see them in the review (E4-2). */
  async file(user: User, id: number): Promise<{ data: Buffer; mime: string }> {
    const { rows } = await this.db.pool.query<FileRow>('SELECT id, kind, file_key FROM caregiver_application_files WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!rows[0]) throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'Photo not found' });
    const key = rows[0].file_key;
    return { data: await this.files.read(key), mime: IMAGE_MIME[key.split('.').pop() as ImageType] };
  }

  /** Submits when nothing is missing: the application locks and the account becomes "pending", all or nothing. */
  async submit(user: User): Promise<Application> {
    await this.db.tx(async (client) => {
      const from = await this.editable(client, user);
      const row = (await this.row(user.id, client))!;
      const app = await this.toApplication(row, await this.fileRows(user.id, client));
      if (app.missing.length) {
        throw new ConflictException({ code: 'APP_INCOMPLETE', message: `Still missing: ${app.missing.join(', ')}`, missing: app.missing });
      }
      await client.query("UPDATE caregiver_applications SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE user_id = $1", [user.id]);
      const actor: Actor = { type: 'caregiver', id: String(user.id) };
      await this.history.record(client, { entity: APP_ENTITY, entityId: user.id, from: row.status, to: 'submitted', actor, reason: 'Application submitted' });
      if (from !== 'pending') {
        await client.query("UPDATE users SET caregiver_status = 'pending' WHERE id = $1", [user.id]);
        await this.history.record(client, { entity: 'caregiver', entityId: user.id, from, to: 'pending', actor, reason: 'Application submitted' });
        await this.messages.caregiverStatusChanged(client, user.id, 'pending');
      }
    });
    return this.get(user);
  }

  /** Admin list (A03): one status, oldest first by when it was sent. */
  async reviewList(status: unknown): Promise<ReviewRow[]> {
    const s = (status ?? 'submitted') as ApplicationStatus;
    if (!REVIEW_FILTERS.includes(s)) throw new BadRequestException({ code: 'BAD_FILTER', message: 'Unknown filter' });
    const { rows } = await this.db.pool.query<ApplicationRow & { user_id: number; phone: string; same_ic: boolean }>(
      `SELECT a.user_id, u.phone, a.status, a.full_name, a.ic_secret, a.experience_years, a.cats, a.dogs, a.max_dog_size, a.areas, a.guide_version, a.admin_note,
         ${ts('a.submitted_at')} AS submitted, ${ts('a.updated_at')} AS updated,
         EXISTS (SELECT 1 FROM caregiver_applications o WHERE o.ic_hash = a.ic_hash AND o.user_id <> a.user_id) AS same_ic
       FROM caregiver_applications a JOIN users u ON u.id = a.user_id WHERE a.status = $1 ORDER BY a.submitted_at, a.user_id`,
      [s],
    );
    const files = await this.db.pool.query<{ user_id: number; kind: ApplicationFileKind }>('SELECT user_id, kind FROM caregiver_application_files WHERE user_id = ANY ($1)', [
      rows.map((r) => r.user_id),
    ]);
    return Promise.all(
      rows.map(async (r) => {
        const app = await this.toApplication(r, files.rows.filter((f) => f.user_id === r.user_id).map((f, i) => ({ id: i, kind: f.kind })));
        return {
          userId: r.user_id,
          fullName: r.full_name,
          phone: formatMyPhone(r.phone),
          status: r.status,
          submittedAt: r.submitted,
          documents: app.missing.length ? `Missing: ${app.missing.join(', ')}` : 'Complete',
          sameIc: r.same_ic,
        };
      }),
    );
  }

  /** Admin detail (A04): the application with the IC masked, other accounts with the same IC, and the history. */
  async reviewDetail(userId: number): Promise<ReviewDetail> {
    const row = await this.row(userId);
    if (!row) throw new NotFoundException({ code: 'APP_NOT_FOUND', message: 'Application not found' });
    const app = await this.toApplication(row, await this.fileRows(userId));
    const { rows } = await this.db.pool.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [userId]);
    return {
      userId,
      phone: formatMyPhone(rows[0].phone),
      application: { ...app, icNumber: maskIc(app.icNumber) },
      sameIc: await this.sameIc(userId),
      history: await this.history.list(APP_ENTITY, userId),
      icViews: await this.history.list(IC_VIEW_ENTITY, userId),
    };
  }

  /** The full IC number for an admin; every view is recorded with who (R13-4). */
  async showIc(admin: AdminUser, userId: number): Promise<{ icNumber: string }> {
    const row = await this.row(userId);
    if (!row?.ic_secret) throw new NotFoundException({ code: 'NO_IC', message: 'No IC number yet' });
    const icNumber = await this.secrets.open(row.ic_secret);
    await this.db.tx((client) =>
      this.history.record(client, { entity: IC_VIEW_ENTITY, entityId: userId, from: null, to: 'shown', actor: { type: 'admin', id: admin.username }, reason: 'Full IC number shown' }),
    );
    return { icNumber };
  }

  /** Any document photo, for the admin review. */
  async adminFile(userId: number, fileId: number): Promise<{ data: Buffer; mime: string }> {
    const { rows } = await this.db.pool.query<FileRow>('SELECT id, kind, file_key FROM caregiver_application_files WHERE id = $1 AND user_id = $2', [fileId, userId]);
    if (!rows[0]) throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'Photo not found' });
    const key = rows[0].file_key;
    return { data: await this.files.read(key), mime: IMAGE_MIME[key.split('.').pop() as ImageType] };
  }

  /**
   * Admin decision (A04): application, account status, history and a message to the applicant, all or nothing.
   * Only an application waiting for review can be decided.
   */
  async decide(admin: AdminUser, userId: number, body: { status?: unknown; note?: unknown; idChecked?: unknown; certChecked?: unknown }): Promise<ReviewDetail> {
    const d = checkAppDecision(body ?? {});
    await this.db.tx(async (client) => {
      const user = await client.query<{ caregiver_status: CaregiverStatus }>('SELECT caregiver_status FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const app = await client.query<{ status: ApplicationStatus; ic_hash: string | null }>('SELECT status, ic_hash FROM caregiver_applications WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!user.rows[0] || !app.rows[0]) throw new NotFoundException({ code: 'APP_NOT_FOUND', message: 'Application not found' });
      const before = app.rows[0].status;
      if (before !== 'submitted') {
        throw new ConflictException({ code: 'APP_NOT_WAITING', message: `This application is ${APPLICATION_STATUS_LABEL[before].toLowerCase()}, not waiting for review` });
      }
      if (d.status === 'approved') {
        const dup = await client.query('SELECT 1 FROM caregiver_applications WHERE ic_hash = $1 AND user_id <> $2 AND status = $3', [app.rows[0].ic_hash, userId, 'approved']);
        if (dup.rowCount) throw new ConflictException({ code: 'IC_ALREADY_APPROVED', message: 'This IC number is already approved on another account' });
      }
      const approved = d.status === 'approved';
      await client.query('UPDATE caregiver_applications SET status = $2, admin_note = $3, id_checked = $4, cert_checked = $5, updated_at = now() WHERE user_id = $1', [
        userId,
        d.status,
        d.caregiverNote,
        approved,
        approved && body.certChecked === true,
      ]);
      const actor: Actor = { type: 'admin', id: admin.username };
      await this.history.record(client, { entity: APP_ENTITY, entityId: userId, from: before, to: d.status, actor, reason: d.internalNote });
      // Needs info keeps the account under review; approve and not approved change it.
      const account: CaregiverStatus = d.status === 'needs_info' ? 'pending' : d.status;
      const from = user.rows[0].caregiver_status;
      if (account !== from) {
        await client.query('UPDATE users SET caregiver_status = $2 WHERE id = $1', [userId, account]);
        await this.history.record(client, { entity: 'caregiver', entityId: userId, from, to: account, actor, reason: d.internalNote });
      }
      await this.messages.send(client, { userId, role: null, category: 'account', ...appDecisionMessage(d.status, d.caregiverNote), link: { type: 'caregiver_application', id: userId } });
    });
    return this.reviewDetail(userId);
  }

  private async sameIc(userId: number): Promise<SameIcAccount[]> {
    const { rows } = await this.db.pool.query<{ phone: string; status: ApplicationStatus }>(
      `SELECT u.phone, o.status FROM caregiver_applications a
       JOIN caregiver_applications o ON o.ic_hash = a.ic_hash AND o.user_id <> a.user_id
       JOIN users u ON u.id = o.user_id WHERE a.user_id = $1 ORDER BY o.user_id`,
      [userId],
    );
    return rows.map((r) => ({ phone: formatMyPhone(r.phone), status: r.status }));
  }

  /**
   * Locks the account and the application (making an empty draft if needed) and checks it can still change.
   * Returns the account's caregiver status.
   */
  private async editable(client: PoolClient, user: User): Promise<CaregiverStatus> {
    const { rows } = await client.query<{ caregiver_status: CaregiverStatus }>('SELECT caregiver_status FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const status = rows[0].caregiver_status;
    if (NO_APPLY.includes(status)) throw new ConflictException({ code: 'ALREADY_CAREGIVER', message: 'You already have a caregiver account' });
    await client.query('INSERT INTO caregiver_applications (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    const app = await client.query<{ status: ApplicationStatus }>('SELECT status FROM caregiver_applications WHERE user_id = $1 FOR UPDATE', [user.id]);
    if (!EDITABLE.includes(app.rows[0].status)) {
      throw new ConflictException({ code: 'APP_LOCKED', message: 'Your application is being reviewed and cannot be changed now' });
    }
    return status;
  }

  private async row(userId: number, conn?: PoolClient): Promise<ApplicationRow | undefined> {
    const { rows } = await (conn ?? this.db.pool).query<ApplicationRow>(`${SELECT} WHERE user_id = $1`, [userId]);
    return rows[0];
  }

  private async fileRows(userId: number, conn?: PoolClient): Promise<ApplicationFile[]> {
    const { rows } = await (conn ?? this.db.pool).query<FileRow>('SELECT id, kind, file_key FROM caregiver_application_files WHERE user_id = $1 ORDER BY id', [userId]);
    return rows.map((r) => ({ id: r.id, kind: r.kind }));
  }

  private async toApplication(r: ApplicationRow, files: ApplicationFile[]): Promise<Application> {
    const fields: ApplicationFields = {
      fullName: r.full_name,
      icNumber: r.ic_secret ? await this.secrets.open(r.ic_secret) : '',
      experienceYears: r.experience_years,
      cats: r.cats,
      dogs: r.dogs,
      maxDogSize: r.max_dog_size,
      areas: r.areas,
      // A new guide version means reading it again.
      guideRead: r.guide_version === CARE_GUIDE.version,
    };
    return { ...fields, status: r.status, files, missing: missingItems(fields, files), adminNote: r.admin_note, submittedAt: r.submitted, updatedAt: r.updated };
  }
}
