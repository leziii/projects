import { ConflictException, Injectable } from '@nestjs/common';
import { OVERTIME_RULES, serviceEndMin, overtimeCheck, overtimeMaxUnits, overtimeText, taskTime, type OvertimeInfo, type User, type VisitTask } from '@pawpal/shared';
import { ScheduleService } from '../caregivers/schedule.service';
import { DbService } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { RequestsService } from './requests.service';

/** E11-2 S11 → S14 (round 46): the caregiver asks for overtime while in service; the owner approves and pays in E11-3. */
@Injectable()
export class OvertimeService {
  constructor(
    private readonly db: DbService,
    private readonly requests: RequestsService,
    private readonly schedules: ScheduleService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
  ) {}

  /** R46-2, R46-3: the units she can ask for, each with the schedule check. */
  async info(user: User, orderId: number, index: number, now = new Date()): Promise<OvertimeInfo> {
    const v = await this.inService(user, orderId, index, now);
    return this.infoOf(user, v);
  }

  /** R46-2 … R46-4 */
  async request(user: User, orderId: number, index: number, unitsIn: unknown, now = new Date()): Promise<OvertimeInfo> {
    const v = await this.inService(user, orderId, index, now);
    const before = await this.infoOf(user, v);
    const units = Number(unitsIn);
    if (before.open?.status === 'paid') throw new ConflictException({ code: 'OVERTIME_PAID', message: 'The owner has already paid overtime for this visit' });
    if (before.open) throw new ConflictException({ code: 'OVERTIME_OPEN', message: 'You already asked for overtime on this visit; withdraw it first' });
    const choice = before.choices.find((c) => c.units === units);
    if (!Number.isInteger(units) || !choice) throw new ConflictException({ code: 'OVERTIME_TOO_LONG', message: `You can ask for up to ${before.choices.length * OVERTIME_RULES.unitMin} min on this visit` });
    if (!choice.fits) throw new ConflictException({ code: 'OVERTIME_CLASH', message: choice.text });
    await this.db.tx(async (client) => {
      const { rowCount } = await client.query(
        "INSERT INTO extra_fees (order_id, idx, kind, units, amount_sen, status) VALUES ($1, $2, 'overtime', $3, $4, 'requested') ON CONFLICT DO NOTHING",
        [orderId, index, units, units * OVERTIME_RULES.unitSen],
      );
      if (!rowCount) throw new ConflictException({ code: 'OVERTIME_OPEN', message: 'You already asked for overtime on this visit; withdraw it first' });
      await this.history.record(client, { entity: 'visit', entityId: orderId, from: 'in_service', to: 'in_service', actor: { type: 'caregiver', id: String(user.id) }, reason: `Overtime asked for visit ${index + 1}: ${overtimeText(units)}` });
      const owner = await this.owner(client, orderId);
      await this.messages.send(client, {
        userId: owner.id,
        role: 'owner',
        category: 'order',
        title: `Overtime asked: ${overtimeText(units)}`,
        body: `${owner.caregiver} asks to stay ${units * OVERTIME_RULES.unitMin} min longer on the visit at ${taskTime(v)}. Until you approve and pay, only the booked service is done.`,
        link: { type: 'order', id: orderId },
      });
    });
    return this.infoOf(user, await this.requests.visit(user, orderId, index, now));
  }

  /** R46-5: withdrawn before the owner pays. */
  async withdraw(user: User, orderId: number, index: number, now = new Date()): Promise<OvertimeInfo> {
    const v = await this.requests.visit(user, orderId, index, now);
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ units: number }>(
        "UPDATE extra_fees SET status = 'withdrawn', updated_at = now() WHERE order_id = $1 AND idx = $2 AND kind = 'overtime' AND status = 'requested' RETURNING units",
        [orderId, index],
      );
      if (!rows[0]) {
        // R47-5: once paid it stays.
        if (v.overtime?.status === 'paid') throw new ConflictException({ code: 'OVERTIME_PAID', message: 'The owner has already paid; it cannot be withdrawn' });
        throw new ConflictException({ code: 'NO_OVERTIME', message: 'There is no overtime request to withdraw' });
      }
      await this.history.record(client, { entity: 'visit', entityId: orderId, from: v.status, to: v.status, actor: { type: 'caregiver', id: String(user.id) }, reason: `Overtime request withdrawn for visit ${index + 1}` });
      const owner = await this.owner(client, orderId);
      await this.messages.send(client, {
        userId: owner.id,
        role: 'owner',
        category: 'order',
        title: 'Overtime request withdrawn',
        body: `${owner.caregiver} no longer asks for ${overtimeText(rows[0].units)} on the visit at ${taskTime(v)}. Nothing to pay.`,
        link: { type: 'order', id: orderId },
      });
    });
    return this.infoOf(user, await this.requests.visit(user, orderId, index, now));
  }

  private async inService(user: User, orderId: number, index: number, now: Date): Promise<VisitTask> {
    const v = await this.requests.visit(user, orderId, index, now);
    if (v.status !== 'in_service') throw new ConflictException({ code: 'NOT_IN_SERVICE', message: 'Overtime can be asked for only during the service' });
    return v;
  }

  private async infoOf(user: User, v: VisitTask): Promise<OvertimeInfo> {
    const s = (await this.schedules.forBookingMany([user.id])).get(user.id)!;
    const self = await this.db.pool.query<{ id: string }>('SELECT id FROM booked_visits WHERE order_id = $1 AND visit_date = $2 AND start_min = $3 ORDER BY id LIMIT 1', [v.orderId, v.date, v.start]);
    const selfId = self.rows[0] ? Number(self.rows[0].id) : null;
    // The service ends at the planned end, or later when it started late.
    const endMin = serviceEndMin(v);
    const bookedMin = v.minutes - v.minMinutes;
    const max = overtimeMaxUnits(s.settings.overtimeMaxMin, bookedMin);
    return {
      orderId: v.orderId,
      index: v.index,
      number: v.number,
      limitMin: s.settings.overtimeMaxMin,
      bookedMin,
      endMin,
      choices: Array.from({ length: max }, (_, i) => overtimeCheck(v.date, endMin, i + 1, s, selfId)),
      open: v.overtime,
    };
  }

  private async owner(client: Parameters<Parameters<DbService['tx']>[0]>[0], orderId: number): Promise<{ id: number; caregiver: string }> {
    const { rows } = await client.query<{ owner_id: number; display_name: string }>(
      'SELECT o.owner_id, c.display_name FROM orders o JOIN caregiver_profiles c ON c.user_id = o.caregiver_id WHERE o.id = $1',
      [orderId],
    );
    const words = rows[0].display_name.trim().split(/\s+/);
    return { id: rows[0].owner_id, caregiver: words.length > 1 ? `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.` : words[0] };
  }
}
