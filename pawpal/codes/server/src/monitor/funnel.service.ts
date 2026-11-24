import { Injectable } from '@nestjs/common';
import { checkFunnelDays, checkFunnelEvent, funnelDays, funnelSteps, type FunnelReport, type FunnelStep } from '@pawpal/shared';
import { DbService } from '../db/db.service';

/** E15-3 (R61-4): our own booking funnel. The app reports each step once per person and day; "paid" comes from paid orders. */
@Injectable()
export class FunnelService {
  constructor(private readonly db: DbService) {}

  async record(input: { step?: unknown; visitor?: unknown }): Promise<{ ok: true }> {
    const { step, visitor } = checkFunnelEvent(input ?? {});
    await this.db.pool.query('INSERT INTO funnel_events (day, step, visitor) VALUES (CURRENT_DATE, $1, $2) ON CONFLICT DO NOTHING', [step, visitor]);
    return { ok: true };
  }

  async report(days: unknown): Promise<FunnelReport> {
    const n = checkFunnelDays(days);
    const { rows: range } = await this.db.pool.query<{ from: string; to: string }>(
      "SELECT to_char(CURRENT_DATE - ($1::int - 1), 'YYYY-MM-DD') AS from, to_char(CURRENT_DATE, 'YYYY-MM-DD') AS to",
      [n],
    );
    const { from, to } = range[0];
    const { rows } = await this.db.pool.query<{ day: string; step: FunnelStep; n: number }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, step, count(*)::int AS n FROM funnel_events WHERE day BETWEEN $1::date AND $2::date GROUP BY day, step
       UNION ALL
       SELECT to_char(p.updated_at::date, 'YYYY-MM-DD') AS day, 'paid' AS step, count(*)::int AS n
       FROM orders o JOIN payments p ON p.id = o.charge_id
       WHERE p.status = 'succeeded' AND p.updated_at::date BETWEEN $1::date AND $2::date GROUP BY p.updated_at::date`,
      [from, to],
    );
    const byDay = funnelDays(from, to, rows);
    return { days: n, from, to, steps: funnelSteps(byDay), byDay };
  }
}
