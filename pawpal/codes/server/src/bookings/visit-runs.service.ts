import { Injectable } from '@nestjs/common';
import { NOT_STARTED, type VisitRun } from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';

/** E8-3 (R35-1): how far each visit of an accepted order has got. No row yet = To do. */
@Injectable()
export class VisitRunsService {
  constructor(private readonly db: DbService) {}

  /** Runs of many orders: key "orderId:idx". */
  async forOrders(orderIds: number[], conn?: PoolClient): Promise<Map<string, VisitRun>> {
    const { rows } = await (conn ?? this.db.pool).query<{ order_id: string; idx: number; status: VisitRun['status']; arrived: string; entered: string | null; entered_by: VisitRun['enteredBy'] }>(
      `SELECT order_id, idx, status, ${ts('arrived_at')} AS arrived, ${ts('entered_at')} AS entered, entered_by FROM visit_runs WHERE order_id = ANY ($1)`,
      [orderIds],
    );
    return new Map(rows.map((r) => [`${r.order_id}:${r.idx}`, { status: r.status, arrivedAt: r.arrived, enteredAt: r.entered, enteredBy: r.entered_by }]));
  }

  async of(orderId: number, idx: number, conn?: PoolClient): Promise<VisitRun> {
    return (await this.forOrders([orderId], conn)).get(`${orderId}:${idx}`) ?? NOT_STARTED;
  }
}

export const runKey = (orderId: number, idx: number) => `${orderId}:${idx}`;
