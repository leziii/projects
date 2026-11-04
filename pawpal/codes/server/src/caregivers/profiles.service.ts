import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  abilityText,
  changeDecisionMessage,
  checkChangeDecision,
  displayName,
  formatMyPhone,
  planProfileSave,
  type Actor,
  type AdminUser,
  type CaregiverProfile,
  type ChangeRow,
  type DogSize,
  type ProfileChange,
  type ProfileInput,
  type StatusChange,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { FileStore, IMAGE_MIME, type ImageType } from '../files/file-store';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';

export interface ProfileRow {
  user_id: number;
  display_name: string;
  cats: boolean;
  dogs: boolean;
  max_dog_size: DogSize | null;
  areas: CaregiverProfile['areas'];
  experience_years: number;
  intro: string;
  photo_key: string | null;
  last_rejected: string | null;
}

interface ChangeDbRow {
  id: number;
  ability_dogs: boolean | null;
  ability_size: DogSize | null;
  photo_key: string | null;
  created: string;
}

/** Admin view of a waiting change: what is in use now, what is asked, and the IC selfie to compare a photo with. */
export interface ChangeDetail {
  userId: number;
  displayName: string;
  phone: string;
  current: string;
  hasCurrentPhoto: boolean;
  change: ProfileChange;
  selfieFileId: number | null;
  history: StatusChange[];
}

const ENTITY = 'caregiver_profile';

const toChange = (c: ChangeDbRow): ProfileChange => ({
  ability: c.ability_dogs === null ? null : { dogs: c.ability_dogs, maxDogSize: c.ability_size },
  photo: !!c.photo_key,
  createdAt: c.created,
});

/** Caregiver profile and area (E4-4, S04). Only approved caregivers have one. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly db: DbService,
    private readonly files: FileStore,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  async get(user: User): Promise<CaregiverProfile> {
    this.approved(user);
    await this.db.tx((client) => this.ensure(client, user.id));
    return this.read(user.id);
  }

  async save(user: User, input: ProfileInput): Promise<CaregiverProfile> {
    this.approved(user);
    await this.db.tx(async (client) => {
      const p = await this.ensure(client, user.id, true);
      const plan = planProfileSave({ dogs: p.dogs, maxDogSize: p.max_dog_size }, input ?? {});
      const n = plan.now;
      await client.query(
        'UPDATE caregiver_profiles SET cats = $2, dogs = $3, max_dog_size = $4, areas = $5, experience_years = $6, intro = $7, updated_at = now() WHERE user_id = $1',
        [user.id, n.cats, n.dogs, n.maxDogSize, n.areas, n.experienceYears, n.intro],
      );
      // A raise waits for review; saving the same or a lower ability drops any raise that was waiting.
      await this.setPending(client, user.id, { ability: plan.ability ?? null });
      if (plan.ability) await this.recordAsked(client, user, `Asked for ${abilityText(plan.ability)}`);
    });
    return this.read(user.id);
  }

  async setPhoto(user: User, data: Buffer, type: ImageType): Promise<CaregiverProfile> {
    this.approved(user);
    const key = await this.files.save('profile', data, type);
    await this.db.tx(async (client) => {
      await this.ensure(client, user.id, true);
      await this.setPending(client, user.id, { photo: key });
      await this.recordAsked(client, user, 'New profile photo');
    });
    return this.read(user.id);
  }

  /** The caregiver's own photo: the one in use, or the one waiting for review. */
  async ownPhoto(user: User, which: unknown): Promise<{ data: Buffer; mime: string }> {
    this.approved(user);
    return this.photo(user.id, which === 'pending' ? 'pending' : 'current');
  }

  /** Admin list: profile changes waiting, oldest first. */
  async changeList(): Promise<ChangeRow[]> {
    const { rows } = await this.db.pool.query<ChangeDbRow & { user_id: number; display_name: string; phone: string }>(
      `SELECT c.id, c.user_id, c.ability_dogs, c.ability_size, c.photo_key, ${ts('c.created_at')} AS created, p.display_name, u.phone
       FROM caregiver_profile_changes c JOIN caregiver_profiles p ON p.user_id = c.user_id JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending' ORDER BY c.created_at, c.id`,
    );
    return rows.map((r) => ({ userId: r.user_id, displayName: displayName(r.display_name), phone: formatMyPhone(r.phone), summary: this.summary(toChange(r)), createdAt: r.created }));
  }

  async changeDetail(userId: number): Promise<ChangeDetail> {
    const p = await this.row(userId);
    const change = await this.pending(userId);
    if (!p || !change) throw new NotFoundException({ code: 'CHANGE_NOT_FOUND', message: 'No profile change waiting' });
    const phone = await this.db.pool.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [userId]);
    const selfie = await this.db.pool.query<{ id: number }>("SELECT id FROM caregiver_application_files WHERE user_id = $1 AND kind = 'selfie' ORDER BY id DESC LIMIT 1", [userId]);
    return {
      userId,
      displayName: displayName(p.display_name),
      phone: formatMyPhone(phone.rows[0].phone),
      current: abilityText({ dogs: p.dogs, maxDogSize: p.max_dog_size }),
      hasCurrentPhoto: !!p.photo_key,
      change: toChange(change),
      selfieFileId: selfie.rows[0]?.id ?? null,
      history: await this.history.list(ENTITY, userId),
    };
  }

  /** The photo owners see on the O08 card: only the approved one, only for approved caregivers. */
  async cardPhoto(userId: number): Promise<{ data: Buffer; mime: string }> {
    const { rows } = await this.db.pool.query("SELECT 1 FROM users WHERE id = $1 AND caregiver_status = 'approved'", [userId]);
    if (!rows.length) throw new NotFoundException({ code: 'NO_PHOTO', message: 'No photo' });
    return this.photo(userId, 'current');
  }

  adminPhoto(userId: number, which: unknown): Promise<{ data: Buffer; mime: string }> {
    return this.photo(userId, which === 'pending' ? 'pending' : 'current');
  }

  /** Approve applies the whole waiting change; Not approved keeps the profile as it was. Message either way. */
  async decideChange(admin: AdminUser, userId: number, status: unknown, note: unknown): Promise<CaregiverProfile> {
    const d = checkChangeDecision(status, note);
    await this.db.tx(async (client) => {
      const { rows } = await client.query<ChangeDbRow>(
        `SELECT id, ability_dogs, ability_size, photo_key, ${ts('created_at')} AS created FROM caregiver_profile_changes WHERE user_id = $1 AND status = 'pending' FOR UPDATE`,
        [userId],
      );
      const c = rows[0];
      if (!c) throw new ConflictException({ code: 'CHANGE_NOT_WAITING', message: 'No profile change is waiting for this caregiver' });
      await client.query('UPDATE caregiver_profile_changes SET status = $2, admin_note = $3, decided_at = now() WHERE id = $1', [c.id, d.status, d.caregiverNote]);
      if (d.status === 'approved') {
        if (c.ability_dogs !== null) {
          await client.query('UPDATE caregiver_profiles SET dogs = $2, max_dog_size = $3 WHERE user_id = $1', [userId, c.ability_dogs, c.ability_size]);
        }
        if (c.photo_key) await client.query('UPDATE caregiver_profiles SET photo_key = $2 WHERE user_id = $1', [userId, c.photo_key]);
        await client.query('UPDATE caregiver_profiles SET last_rejected = NULL, updated_at = now() WHERE user_id = $1', [userId]);
      } else {
        await client.query('UPDATE caregiver_profiles SET last_rejected = $2 WHERE user_id = $1', [userId, d.caregiverNote]);
      }
      const actor: Actor = { type: 'admin', id: admin.username };
      await this.history.record(client, { entity: ENTITY, entityId: userId, from: 'pending', to: d.status, actor, reason: `${this.summary(toChange(c))}: ${d.internalNote}` });
      await this.messages.send(client, { userId, role: null, category: 'account', ...changeDecisionMessage(d.status, d.caregiverNote), link: null });
    });
    return this.read(userId);
  }

  private approved(user: User) {
    if (user.caregiverStatus !== 'approved') throw new ForbiddenException({ code: 'NOT_APPROVED', message: 'Your caregiver application is not approved yet' });
  }

  /** Makes the missing profiles of every approved caregiver at once (for the O07 list). */
  async ensureApproved(): Promise<void> {
    await this.db.pool.query(
      `INSERT INTO caregiver_profiles (user_id, display_name, cats, dogs, max_dog_size, areas, experience_years)
       SELECT u.id, COALESCE(a.full_name, ''), COALESCE(a.cats, false), COALESCE(a.dogs, false), a.max_dog_size, COALESCE(a.areas, '{}'), COALESCE(a.experience_years, 0)
       FROM users u LEFT JOIN caregiver_applications a ON a.user_id = u.id
       WHERE u.caregiver_status = 'approved' AND NOT EXISTS (SELECT 1 FROM caregiver_profiles p WHERE p.user_id = u.id)
       ON CONFLICT (user_id) DO NOTHING`,
    );
  }

  /** Makes the profile from the application the first time, then returns it (locked when asked). */
  async ensure(client: PoolClient, userId: number, lock = false): Promise<ProfileRow> {
    await client.query(
      `INSERT INTO caregiver_profiles (user_id, display_name, cats, dogs, max_dog_size, areas, experience_years)
       SELECT u.id, COALESCE(a.full_name, ''), COALESCE(a.cats, false), COALESCE(a.dogs, false), a.max_dog_size, COALESCE(a.areas, '{}'), COALESCE(a.experience_years, 0)
       FROM users u LEFT JOIN caregiver_applications a ON a.user_id = u.id WHERE u.id = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const { rows } = await client.query<ProfileRow>(`SELECT * FROM caregiver_profiles WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [userId]);
    return rows[0];
  }

  /**
   * Updates the one waiting change (R15-4): a new ability or photo replaces the old part, the other part stays.
   * A change with nothing left is withdrawn. Sending something new clears the last "not approved" note.
   */
  private async setPending(client: PoolClient, userId: number, part: { ability?: { dogs: boolean; maxDogSize: DogSize | null } | null; photo?: string }) {
    const { rows } = await client.query<ChangeDbRow>(
      `SELECT id, ability_dogs, ability_size, photo_key, ${ts('created_at')} AS created FROM caregiver_profile_changes WHERE user_id = $1 AND status = 'pending' FOR UPDATE`,
      [userId],
    );
    const old = rows[0];
    const abilityDogs = part.ability === undefined ? (old?.ability_dogs ?? null) : (part.ability?.dogs ?? null);
    const abilitySize = part.ability === undefined ? (old?.ability_size ?? null) : (part.ability?.maxDogSize ?? null);
    const photo = part.photo ?? old?.photo_key ?? null;
    const sendsNew = (part.ability ?? null) !== null || part.photo !== undefined;
    if (sendsNew) await client.query('UPDATE caregiver_profiles SET last_rejected = NULL WHERE user_id = $1', [userId]);
    if (!old) {
      if (abilityDogs !== null || photo) {
        await client.query('INSERT INTO caregiver_profile_changes (user_id, ability_dogs, ability_size, photo_key) VALUES ($1, $2, $3, $4)', [userId, abilityDogs, abilitySize, photo]);
      }
      return;
    }
    if (abilityDogs === null && !photo) {
      await client.query("UPDATE caregiver_profile_changes SET status = 'withdrawn', decided_at = now() WHERE id = $1", [old.id]);
      return;
    }
    // A new request goes to the back of the queue.
    const reset = sendsNew ? ', created_at = now()' : '';
    await client.query(`UPDATE caregiver_profile_changes SET ability_dogs = $2, ability_size = $3, photo_key = $4${reset} WHERE id = $1`, [old.id, abilityDogs, abilitySize, photo]);
  }

  private recordAsked(client: PoolClient, user: User, reason: string) {
    return this.history.record(client, { entity: ENTITY, entityId: user.id, from: null, to: 'pending', actor: { type: 'caregiver', id: String(user.id) }, reason });
  }

  private summary(c: ProfileChange): string {
    return [c.ability ? abilityText(c.ability) : '', c.photo ? 'New photo' : ''].filter(Boolean).join(' · ');
  }

  private async read(userId: number): Promise<CaregiverProfile> {
    const p = (await this.row(userId))!;
    const c = await this.pending(userId);
    return {
      displayName: displayName(p.display_name),
      cats: p.cats,
      dogs: p.dogs,
      maxDogSize: p.max_dog_size,
      areas: p.areas,
      experienceYears: p.experience_years,
      intro: p.intro,
      hasPhoto: !!p.photo_key,
      pending: c ? toChange(c) : null,
      lastRejected: p.last_rejected,
    };
  }

  private async row(userId: number): Promise<ProfileRow | undefined> {
    const { rows } = await this.db.pool.query<ProfileRow>('SELECT * FROM caregiver_profiles WHERE user_id = $1', [userId]);
    return rows[0];
  }

  private async pending(userId: number): Promise<ChangeDbRow | undefined> {
    const { rows } = await this.db.pool.query<ChangeDbRow>(
      `SELECT id, ability_dogs, ability_size, photo_key, ${ts('created_at')} AS created FROM caregiver_profile_changes WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
    return rows[0];
  }

  private async photo(userId: number, which: 'current' | 'pending'): Promise<{ data: Buffer; mime: string }> {
    const key = which === 'pending' ? (await this.pending(userId))?.photo_key : (await this.row(userId))?.photo_key;
    if (!key) throw new NotFoundException({ code: 'NO_PHOTO', message: 'No photo' });
    return { data: await this.files.read(key), mime: IMAGE_MIME[key.split('.').pop() as ImageType] };
  }
}
