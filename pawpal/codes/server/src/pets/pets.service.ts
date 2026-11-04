import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PET_CHECK_STATUSES,
  PET_STATUS_LABEL,
  checkAdminDecision,
  checkPet,
  checkReasons,
  formatMyPhone,
  petDecisionMessage,
  petSummary,
  riskyChange,
  statusAfterSave,
  type Actor,
  type AdminUser,
  type CheckReason,
  type Pet,
  type PetCheckRow,
  type PetFields,
  type PetInput,
  type PetStatus,
  type StatusChange,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME, type ImageType } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';

interface PetRow {
  id: number;
  owner_id: number;
  kind: Pet['kind'];
  name: string;
  birth_year: number;
  birth_month: number;
  breed: string | null;
  weight_kg: string | null;
  vaccinated: boolean;
  vaccine_year: number | null;
  vaccine_month: number | null;
  vaccine_photo: string | null;
  health_note: string;
  status: PetStatus;
  check_reasons: string;
  admin_note: string | null;
  updated: string;
}

const COLUMNS = `id, owner_id, kind, name, birth_year, birth_month, breed, weight_kg, vaccinated, vaccine_year, vaccine_month,
  vaccine_photo, health_note, status, check_reasons, admin_note, ${ts('updated_at')} AS updated`;
const SELECT = `SELECT ${COLUMNS} FROM pets`;

const toPet = (r: PetRow): Pet => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  birth: { year: r.birth_year, month: r.birth_month },
  breed: r.breed,
  weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
  vaccinated: r.vaccinated,
  lastVaccine: r.vaccine_year && r.vaccine_month ? { year: r.vaccine_year, month: r.vaccine_month } : null,
  healthNote: r.health_note,
  status: r.status,
  checkReasons: r.check_reasons ? (r.check_reasons.split(',') as CheckReason[]) : [],
  adminNote: r.admin_note,
  hasVaccinePhoto: !!r.vaccine_photo,
  updatedAt: r.updated,
});

const columns = (p: PetFields) => [p.kind, p.name, p.birth.year, p.birth.month, p.breed, p.weightKg, p.vaccinated, p.lastVaccine?.year ?? null, p.lastVaccine?.month ?? null, p.healthNote];

/** Why the status changed, for the history (rule G9). */
const ownerReason = (reasons: CheckReason[]) => (reasons.length ? `Owner saved profile; check: ${reasons.join(', ')}` : 'Owner saved profile; nothing to check');

/** Pet detail for the admin check (A06). */
export interface PetCheckDetail {
  pet: Pet;
  ownerPhone: string;
  history: StatusChange[];
}

/**
 * Pet profiles (E3-1) and the admin pet check (E3-3).
 * Owner queries are limited to the logged-in owner's own pets.
 */
@Injectable()
export class PetsService {
  constructor(
    private readonly db: DbService,
    private readonly files: FileStore,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  async list(user: User): Promise<Pet[]> {
    const { rows } = await this.db.pool.query<PetRow>(`${SELECT} WHERE owner_id = $1 ORDER BY id`, [user.id]);
    return rows.map(toPet);
  }

  async get(user: User, id: number): Promise<Pet> {
    return toPet(await this.row(user, id));
  }

  async create(user: User, input: Partial<PetInput>, now = new Date()): Promise<Pet> {
    const pet = checkPet(input, now);
    const reasons = checkReasons(pet, now);
    const status = statusAfterSave(null, reasons);
    return this.db.tx(async (client) => {
      const { rows } = await client.query<PetRow>(
        `INSERT INTO pets (owner_id, kind, name, birth_year, birth_month, breed, weight_kg, vaccinated, vaccine_year, vaccine_month, health_note, status, check_reasons)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${COLUMNS}`,
        [user.id, ...columns(pet), status, reasons.join(',')],
      );
      await this.history.record(client, { entity: 'pet', entityId: rows[0].id, from: null, to: status, actor: this.owner(user), reason: ownerReason(reasons) });
      return toPet(rows[0]);
    });
  }

  async update(user: User, id: number, input: Partial<PetInput>, now = new Date()): Promise<Pet> {
    const pet = checkPet(input, now);
    const reasons = checkReasons(pet, now);
    return this.db.tx(async (client) => {
      const before = await this.row(user, id, client, true);
      const status = statusAfterSave(before.status, reasons, riskyChange(toPet(before), pet));
      const { rows } = await client.query<PetRow>(
        `UPDATE pets SET kind = $2, name = $3, birth_year = $4, birth_month = $5, breed = $6, weight_kg = $7, vaccinated = $8,
           vaccine_year = $9, vaccine_month = $10, health_note = $11, status = $12::text, check_reasons = $13, updated_at = now(),
           admin_note = CASE WHEN $12::text = 'rejected' THEN admin_note ELSE NULL END
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, ...columns(pet), status, reasons.join(',')],
      );
      if (status !== before.status) {
        await this.history.record(client, { entity: 'pet', entityId: id, from: before.status, to: status, actor: this.owner(user), reason: ownerReason(reasons) });
      }
      return toPet(rows[0]);
    });
  }

  async setVaccinePhoto(user: User, id: number, data: Buffer, type: ImageType): Promise<Pet> {
    await this.row(user, id);
    const key = await this.files.save('vaccine', data, type);
    await this.db.pool.query('UPDATE pets SET vaccine_photo = $2, updated_at = now() WHERE id = $1', [id, key]);
    return this.get(user, id);
  }

  async vaccinePhoto(user: User | null, id: number): Promise<{ data: Buffer; mime: string }> {
    const key = (user ? await this.row(user, id) : await this.anyRow(id)).vaccine_photo;
    if (!key) throw new NotFoundException({ code: 'NO_PHOTO', message: 'No vaccine card photo yet' });
    return { data: await this.files.read(key), mime: IMAGE_MIME[key.split('.').pop() as ImageType] };
  }

  /** Admin queue (A05): pets waiting for a check or for the owner, oldest first. */
  async checkList(now = new Date()): Promise<PetCheckRow[]> {
    const { rows } = await this.db.pool.query<PetRow & { phone: string }>(
      `SELECT p.*, ${ts('p.updated_at')} AS updated, u.phone
       FROM pets p JOIN users u ON u.id = p.owner_id WHERE p.status = ANY ($1) ORDER BY p.updated_at, p.id`,
      [PET_CHECK_STATUSES],
    );
    return rows.map((r) => {
      const pet = toPet(r);
      return { id: pet.id, name: pet.name, kind: pet.kind, summary: petSummary(pet, now), ownerPhone: formatMyPhone(r.phone), status: pet.status, checkReasons: pet.checkReasons, updatedAt: pet.updatedAt };
    });
  }

  /** Admin detail (A06): profile, owner, and every status change. */
  async checkDetail(id: number): Promise<PetCheckDetail> {
    const row = await this.anyRow(id);
    const { rows } = await this.db.pool.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [row.owner_id]);
    return { pet: toPet(row), ownerPhone: formatMyPhone(rows[0].phone), history: await this.history.list('pet', id) };
  }

  /** Admin decision (A06): saved with a history row and a message to the owner, all or nothing. */
  async decide(admin: AdminUser, id: number, status: unknown, note: unknown): Promise<Pet> {
    const d = checkAdminDecision(status, note);
    return this.db.tx(async (client) => {
      const before = await this.anyRow(id, client, true);
      if (!PET_CHECK_STATUSES.includes(before.status)) {
        throw new ConflictException({ code: 'PET_NOT_IN_CHECK', message: `This pet is ${PET_STATUS_LABEL[before.status].toLowerCase()}, not waiting for a check` });
      }
      const { rows } = await client.query<PetRow>(`UPDATE pets SET status = $2, admin_note = $3, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [
        id,
        d.status,
        d.ownerNote,
      ]);
      const actor: Actor = { type: 'admin', id: admin.username };
      await this.history.record(client, { entity: 'pet', entityId: id, from: before.status, to: d.status, actor, reason: d.internalNote || 'Approved after check' });
      await this.messages.send(client, { userId: before.owner_id, role: null, category: 'account', ...petDecisionMessage(before.name, d.status), link: { type: 'pet', id } });
      return toPet(rows[0]);
    });
  }

  private owner = (user: User): Actor => ({ type: 'owner', id: String(user.id) });

  /** Someone else's pet looks the same as a missing one. */
  private async row(user: User, id: number, conn?: PoolClient, lock = false): Promise<PetRow> {
    const { rows } = await (conn ?? this.db.pool).query<PetRow>(`${SELECT} WHERE id = $1 AND owner_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, user.id]);
    if (!rows[0]) throw new NotFoundException({ code: 'PET_NOT_FOUND', message: 'Pet not found' });
    return rows[0];
  }

  private async anyRow(id: number, conn?: PoolClient, lock = false): Promise<PetRow> {
    const { rows } = await (conn ?? this.db.pool).query<PetRow>(`${SELECT} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'PET_NOT_FOUND', message: 'Pet not found' });
    return rows[0];
  }
}
