import { Injectable } from '@nestjs/common';
import { NOT_STARTED, checklistFor, type CheckItem, type CheckRow, type PetKind, type VisitRun } from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';

/** E8-3 (R35-1): how far each visit of an accepted order has got. No row yet = To do. */
@Injectable()
export class VisitRunsService {
  constructor(private readonly db: DbService) {}

  /** Runs of many orders: key "orderId:idx". */
  async forOrders(orderIds: number[], conn?: PoolClient): Promise<Map<string, VisitRun>> {
    const { rows } = await (conn ?? this.db.pool).query<{ order_id: string; idx: number; status: VisitRun['status']; arrived: string; entered: string | null; entered_by: VisitRun['enteredBy']; reported: string | null; located: boolean; confirmed: string | null; confirmed_by: VisitRun['confirmedBy']; cancelled: string | null; cancel_percent: number | null; cancel_refund_sen: number | null; cancel_credit_sen: number | null; waiting: string | null }>(
      `SELECT order_id, idx, status, ${ts('arrived_at')} AS arrived, ${ts('entered_at')} AS entered, entered_by, ${ts('reported_at')} AS reported, ${ts('confirmed_at')} AS confirmed, confirmed_by,
         ${ts('cancelled_at')} AS cancelled, ${ts('waiting_requested_at')} AS waiting, cancel_percent, cancel_refund_sen, cancel_credit_sen,
         EXISTS (SELECT 1 FROM location_checks l WHERE l.order_id = visit_runs.order_id AND l.idx = visit_runs.idx AND l.lat IS NOT NULL) AS located
       FROM visit_runs WHERE order_id = ANY ($1)`,
      [orderIds],
    );
    return new Map(rows.map((r) => [
      `${r.order_id}:${r.idx}`,
      { status: r.status, arrivedAt: r.arrived, enteredAt: r.entered, enteredBy: r.entered_by, reportedAt: r.reported, locationRecorded: r.located, confirmedAt: r.confirmed,
        confirmedBy: r.confirmed_by,
        cancel: r.cancelled ? { at: r.cancelled, percent: r.cancel_percent!, refundSen: r.cancel_refund_sen!, creditSen: r.cancel_credit_sen! } : null,
        waitingAt: r.waiting,
      },
    ]));
  }

  async of(orderId: number, idx: number, conn?: PoolClient): Promise<VisitRun> {
    return (await this.forOrders([orderId], conn)).get(`${orderId}:${idx}`) ?? NOT_STARTED;
  }

  /** E8-4, E8-5 (R36-3, R36-4, R37-2): the checklist with its ticks, the photo ids and the note. */
  async service(orderId: number, idx: number, pets: { kind: PetKind }[]): Promise<{ checklist: CheckRow[]; photos: number[]; note: string }> {
    const done = await this.db.pool.query<{ item: CheckItem }>('SELECT item FROM visit_checks WHERE order_id = $1 AND idx = $2', [orderId, idx]);
    const photos = await this.db.pool.query<{ id: string }>('SELECT id FROM visit_photos WHERE order_id = $1 AND idx = $2 ORDER BY id', [orderId, idx]);
    const ticked = new Set(done.rows.map((r) => r.item));
    const note = await this.db.pool.query<{ note: string }>('SELECT note FROM visit_runs WHERE order_id = $1 AND idx = $2', [orderId, idx]);
    return { checklist: checklistFor(pets).map((item) => ({ item, done: ticked.has(item) })), photos: photos.rows.map((r) => Number(r.id)), note: note.rows[0]?.note ?? '' };
  }

  /** E9-1: which visit a run id (a message link) points to. */
  async visitOf(runId: number): Promise<{ orderId: number; idx: number } | null> {
    const { rows } = await this.db.pool.query<{ order_id: string; idx: number }>('SELECT order_id, idx FROM visit_runs WHERE id = $1', [runId]);
    return rows[0] ? { orderId: Number(rows[0].order_id), idx: rows[0].idx } : null;
  }

  /** The stored file of one visit photo. */
  async photoKey(orderId: number, idx: number, photoId: number): Promise<string | null> {
    const { rows } = await this.db.pool.query<{ file_key: string }>('SELECT file_key FROM visit_photos WHERE id = $1 AND order_id = $2 AND idx = $3', [photoId, orderId, idx]);
    return rows[0]?.file_key ?? null;
  }
}

export const runKey = (orderId: number, idx: number) => `${orderId}:${idx}`;
