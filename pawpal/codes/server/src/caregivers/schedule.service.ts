import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SCHEDULE_DAYS,
  addDays,
  checkBlock,
  checkBufferChange,
  checkSettings,
  klDate,
  normalizeMyPhone,
  type Block,
  type BlockInput,
  type BookedVisit,
  type Schedule,
  type ScheduleSettings,
  type User,
} from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { ProfilesService } from './profiles.service';

interface BlockRow {
  id: number;
  kind: Block['kind'];
  block_date: string | null;
  weekday: number | null;
  start_min: number;
  end_min: number;
}

interface VisitRow {
  id: number;
  visit_date: string;
  start_min: number;
  minutes: number;
  label: string;
}

const toBlock = (r: BlockRow): Block => ({ id: r.id, kind: r.kind, date: r.block_date, weekday: r.weekday, start: r.start_min, end: r.end_min });
const toVisit = (r: VisitRow): BookedVisit => ({ id: r.id, date: r.visit_date, start: r.start_min, minutes: r.minutes, label: r.label });

/** Caregiver schedule (E4-5, S05): settings, "Not available" blocks and booked visits. */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly db: DbService,
    private readonly profiles: ProfilesService,
  ) {}

  async get(user: User, now = new Date()): Promise<Schedule> {
    this.approved(user);
    return this.db.tx(async (client) => {
      await this.profiles.ensure(client, user.id);
      return this.read(client, user.id, klDate(now));
    });
  }

  async saveSettings(user: User, input: Partial<ScheduleSettings>, now = new Date()): Promise<Schedule> {
    this.approved(user);
    const settings = checkSettings(input ?? {});
    return this.db.tx(async (client) => {
      await this.profiles.ensure(client, user.id, true);
      const today = klDate(now);
      const current = await this.read(client, user.id, today);
      checkBufferChange(settings, current.blocks, current.visits, today);
      await client.query('UPDATE caregiver_profiles SET travel_buffer_min = $2, overtime_max_min = $3, updated_at = now() WHERE user_id = $1', [
        user.id,
        settings.travelBufferMin,
        settings.overtimeMaxMin,
      ]);
      return this.read(client, user.id, today);
    });
  }

  async addBlock(user: User, input: BlockInput, now = new Date()): Promise<Schedule> {
    this.approved(user);
    return this.db.tx(async (client) => {
      // Locked so a visit booked at the same moment cannot slip under the new block.
      await this.profiles.ensure(client, user.id, true);
      const today = klDate(now);
      const s = await this.read(client, user.id, today);
      const b = checkBlock(input ?? {}, s.visits, s.settings.travelBufferMin, today);
      await client.query('INSERT INTO caregiver_blocks (user_id, kind, block_date, weekday, start_min, end_min) VALUES ($1, $2, $3, $4, $5, $6)', [
        user.id,
        b.kind,
        b.date,
        b.weekday,
        b.start,
        b.end,
      ]);
      return this.read(client, user.id, today);
    });
  }

  async removeBlock(user: User, id: number, now = new Date()): Promise<Schedule> {
    this.approved(user);
    return this.db.tx(async (client) => {
      const { rowCount } = await client.query('DELETE FROM caregiver_blocks WHERE id = $1 AND user_id = $2', [id, user.id]);
      if (!rowCount) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: 'Block not found' });
      return this.read(client, user.id, klDate(now));
    });
  }

  /** Test tool until orders exist (E6): puts a booked visit on an approved caregiver's schedule. */
  async addTestVisit(phoneInput: unknown, input: { date?: unknown; start?: unknown; minutes?: unknown }): Promise<BookedVisit> {
    const phone = normalizeMyPhone(String(phoneInput ?? ''));
    if (!phone) throw new BadRequestException({ code: 'BAD_PHONE', message: 'Enter a Malaysian mobile number' });
    const { rows } = await this.db.pool.query<{ id: number; caregiver_status: string }>('SELECT id, caregiver_status FROM users WHERE phone = $1', [phone]);
    if (!rows[0]) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No account with this number' });
    if (rows[0].caregiver_status !== 'approved') throw new ForbiddenException({ code: 'NOT_APPROVED', message: 'This account is not an approved caregiver' });
    const date = String(input.date ?? '');
    const start = Number(input.start);
    const minutes = Number(input.minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(start) || start < 0 || start >= 1440 || !Number.isInteger(minutes) || minutes <= 0 || minutes > 300) {
      throw new BadRequestException({ code: 'BAD_VISIT', message: 'Give a date (YYYY-MM-DD), a start in minutes and a length in minutes' });
    }
    const inserted = await this.db.pool.query<VisitRow>(
      "INSERT INTO booked_visits (caregiver_id, visit_date, start_min, minutes, label) VALUES ($1, $2, $3, $4, 'Test visit') RETURNING id, to_char(visit_date, 'YYYY-MM-DD') AS visit_date, start_min, minutes, label",
      [rows[0].id, date, start, minutes],
    );
    return toVisit(inserted.rows[0]);
  }

  /** The schedule with the caregiver's profile row locked, so a block or another accept cannot slip in meanwhile (R26-1). */
  async lockedFor(client: PoolClient, userId: number, now = new Date()): Promise<Schedule> {
    await this.profiles.ensure(client, userId, true);
    return this.read(client, userId, klDate(now));
  }

  /** Blocks, booked visits and buffer of many caregivers at once, for the O07 list. */
  async forBookingMany(ids: number[], now = new Date()): Promise<Map<number, Pick<Schedule, 'settings' | 'blocks' | 'visits'>>> {
    const today = klDate(now);
    const out = new Map<number, Pick<Schedule, 'settings' | 'blocks' | 'visits'>>();
    if (!ids.length) return out;
    const p = await this.db.pool.query<{ user_id: number; travel_buffer_min: number; overtime_max_min: number }>(
      'SELECT user_id, travel_buffer_min, overtime_max_min FROM caregiver_profiles WHERE user_id = ANY ($1)',
      [ids],
    );
    for (const r of p.rows) out.set(r.user_id, { settings: { travelBufferMin: r.travel_buffer_min, overtimeMaxMin: r.overtime_max_min }, blocks: [], visits: [] });
    const blocks = await this.db.pool.query<BlockRow & { user_id: number }>(
      "SELECT user_id, id, kind, to_char(block_date, 'YYYY-MM-DD') AS block_date, weekday, start_min, end_min FROM caregiver_blocks WHERE user_id = ANY ($1) AND (kind = 'weekly' OR block_date >= $2)",
      [ids, today],
    );
    for (const b of blocks.rows) out.get(b.user_id)?.blocks.push(toBlock(b));
    const visits = await this.db.pool.query<VisitRow & { caregiver_id: number }>(
      "SELECT caregiver_id, id, to_char(visit_date, 'YYYY-MM-DD') AS visit_date, start_min, minutes, label FROM booked_visits WHERE caregiver_id = ANY ($1) AND visit_date BETWEEN $2 AND $3",
      [ids, today, addDays(today, SCHEDULE_DAYS)],
    );
    for (const v of visits.rows) out.get(v.caregiver_id)?.visits.push(toVisit(v));
    return out;
  }

  private approved(user: User) {
    if (user.caregiverStatus !== 'approved') throw new ForbiddenException({ code: 'NOT_APPROVED', message: 'Your caregiver application is not approved yet' });
  }

  /** Settings, every block, and booked visits from today to 60 days ahead. */
  private async read(client: PoolClient, userId: number, today: string): Promise<Schedule> {
    const p = await client.query<{ travel_buffer_min: number; overtime_max_min: number }>('SELECT travel_buffer_min, overtime_max_min FROM caregiver_profiles WHERE user_id = $1', [userId]);
    const blocks = await client.query<BlockRow>(
      "SELECT id, kind, to_char(block_date, 'YYYY-MM-DD') AS block_date, weekday, start_min, end_min FROM caregiver_blocks WHERE user_id = $1 AND (kind = 'weekly' OR block_date >= $2) ORDER BY id",
      [userId, today],
    );
    const visits = await client.query<VisitRow>(
      "SELECT id, to_char(visit_date, 'YYYY-MM-DD') AS visit_date, start_min, minutes, label FROM booked_visits WHERE caregiver_id = $1 AND visit_date BETWEEN $2 AND $3 ORDER BY visit_date, start_min",
      [userId, today, addDays(today, SCHEDULE_DAYS)],
    );
    return {
      today,
      settings: { travelBufferMin: p.rows[0].travel_buffer_min, overtimeMaxMin: p.rows[0].overtime_max_min },
      blocks: blocks.rows.map(toBlock),
      visits: visits.rows.map(toVisit),
    };
  }
}
