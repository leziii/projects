import { Injectable, NotFoundException } from '@nestjs/common';
import { INSURANCE_OFF, checkInsurance, displayName, initials, type AdminUser, type CaregiverCard, type Insurance, type StatusChange } from '@pawpal/shared';
import { DbService } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { ProfilesService, type ProfileRow } from './profiles.service';

const INSURANCE_KEY = 'insurance';
const INSURANCE_ENTITY = 'insurance';

export interface InsuranceAdmin {
  insurance: Insurance;
  history: StatusChange[];
}

/** What owners see about a caregiver (E4-6, O08): badges and the platform insurance note. */
@Injectable()
export class TrustService {
  constructor(
    private readonly db: DbService,
    private readonly history: HistoryService,
    private readonly profiles: ProfilesService,
  ) {}

  /**
   * Only approved caregivers are shown; suspended, pending and others are "not found" (R17-2).
   * An account approved without an application (test tools) has no badge.
   */
  async card(id: number): Promise<CaregiverCard> {
    const [card] = await this.approvedCards([id]);
    if (!card) throw new NotFoundException({ code: 'CAREGIVER_NOT_FOUND', message: 'This caregiver is not available' });
    return card;
  }

  /** Cards of approved caregivers (all, or these ids), with each one's overtime limit for matching (E5-2). */
  async approvedCards(ids?: number[]): Promise<(CaregiverCard & { overtimeMaxMin: number })[]> {
    await this.profiles.ensureApproved();
    const { rows } = await this.db.pool.query<ProfileRow & { overtime_max_min: number; id_checked: boolean; cert_checked: boolean }>(
      `SELECT p.*, COALESCE(a.id_checked, false) AS id_checked, COALESCE(a.cert_checked, false) AS cert_checked
       FROM users u JOIN caregiver_profiles p ON p.user_id = u.id LEFT JOIN caregiver_applications a ON a.user_id = u.id
       WHERE u.caregiver_status = 'approved' AND ($1::bigint[] IS NULL OR u.id = ANY ($1)) ORDER BY u.id`,
      [ids ?? null],
    );
    const insurance = await this.insurance();
    return rows.map((p) => {
      const name = displayName(p.display_name);
      return {
        id: p.user_id,
        displayName: name,
        initials: initials(name),
        hasPhoto: !!p.photo_key,
        experienceYears: p.experience_years,
        areas: p.areas,
        cats: p.cats,
        dogs: p.dogs,
        maxDogSize: p.max_dog_size,
        intro: p.intro,
        idVerified: p.id_checked,
        certChecked: p.cert_checked,
        insurance: insurance.on ? insurance.note : null,
        overtimeMaxMin: p.overtime_max_min,
      };
    });
  }

  async insurance(): Promise<Insurance> {
    const { rows } = await this.db.pool.query<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [INSURANCE_KEY]);
    return rows[0] ? (JSON.parse(rows[0].value) as Insurance) : INSURANCE_OFF;
  }

  async insuranceAdmin(): Promise<InsuranceAdmin> {
    return { insurance: await this.insurance(), history: await this.history.list(INSURANCE_ENTITY, 1) };
  }

  /** R17-3: one switch and note for the whole platform; every change goes into the history. */
  async setInsurance(admin: AdminUser, body: { on?: unknown; note?: unknown; reason?: unknown }): Promise<InsuranceAdmin> {
    const { on, note, reason } = checkInsurance(body ?? {});
    await this.db.tx(async (client) => {
      const old = await client.query<{ value: string }>('SELECT value FROM app_settings WHERE key = $1 FOR UPDATE', [INSURANCE_KEY]);
      const before: Insurance = old.rows[0] ? JSON.parse(old.rows[0].value) : INSURANCE_OFF;
      await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [INSURANCE_KEY, JSON.stringify({ on, note })]);
      const text = note ? `${reason} · Note: ${note}` : reason;
      await this.history.record(client, {
        entity: INSURANCE_ENTITY,
        entityId: 1,
        from: before.on ? 'on' : 'off',
        to: on ? 'on' : 'off',
        actor: { type: 'admin', id: admin.username },
        reason: text.slice(0, 255),
      });
    });
    return this.insuranceAdmin();
  }
}
