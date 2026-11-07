import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { BookingDraft, OrderDetail, OrderPage, OrderView, User, VisitReport } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BookingsService, type Checkout } from './bookings.service';
import { OrdersService } from './orders.service';

/** Confirm and pay (O10) and the order it makes. */
@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly orders: OrdersService,
  ) {}

  /** O10: the booking to confirm and what still stops payment. */
  @Get('bookings/draft/checkout')
  checkout(@CurrentUser() user: User): Promise<Checkout> {
    return this.bookings.checkout(user);
  }

  /** O10 promo code "Apply" (R23-3). */
  @Post('bookings/draft/promo')
  @HttpCode(200)
  applyPromo(@CurrentUser() user: User, @Body() body: { code?: unknown }): Promise<Checkout> {
    return this.bookings.applyPromo(user, body?.code);
  }

  @Post('bookings/draft/promo/remove')
  @HttpCode(200)
  removePromo(@CurrentUser() user: User): Promise<Checkout> {
    return this.bookings.removePromo(user);
  }

  /** O10 "Pay": makes the order with prices locked and starts the payment. */
  @Post('bookings/draft/pay')
  @HttpCode(200)
  pay(@CurrentUser() user: User, @Body() body: { healthConfirmed?: unknown; method?: unknown }): Promise<{ order: OrderView; paymentId: number }> {
    return this.orders.pay(user, body);
  }

  /** E7-1 My orders. */
  @Get('orders')
  list(@CurrentUser() user: User, @Query('filter') filter?: string, @Query('before') before?: string): Promise<OrderPage> {
    return this.orders.list(user, filter, before);
  }

  /** E7-2 O13 order details. */
  @Get('orders/:id/detail')
  detail(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<OrderDetail> {
    return this.orders.detail(user, id);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<OrderView> {
    return this.orders.get(user, id);
  }

  /** "Try again" after a failed payment, on the same order. */
  @Post('orders/:id/pay')
  @HttpCode(200)
  retry(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { method?: unknown }): Promise<{ order: OrderView; paymentId: number }> {
    return this.orders.retry(user, id, body?.method);
  }

  /** E6-4: withdraw a paid order before the caregiver accepts (full refund). */
  @Post('orders/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<OrderView> {
    return this.orders.withdraw(user, id);
  }

  /** E8-3 Live confirm: the owner lets the arrived caregiver in (R35-4). */
  @Post('orders/:id/visits/:i/confirm-entry')
  @HttpCode(200)
  confirmEntry(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('i', ParseIntPipe) i: number): Promise<OrderDetail> {
    return this.orders.confirmEntry(user, id, i);
  }

  /** E9-1 O17: the visit's sent report (R39-2). */
  @Get('orders/:id/visits/:i/report')
  report(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('i', ParseIntPipe) i: number): Promise<VisitReport> {
    return this.orders.report(user, id, i);
  }

  /** E9-1: the report from a message link, by its run id (R39-1). */
  @Get('reports/:runId')
  reportByRun(@CurrentUser() user: User, @Param('runId', ParseIntPipe) runId: number): Promise<VisitReport> {
    return this.orders.reportByRun(user, runId);
  }

  /** E9-1: a report photo, private to the order's owner here (R39-4). */
  @Get('orders/:id/visits/:i/photos/:photoId')
  async photo(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('i', ParseIntPipe) i: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mime } = await this.orders.reportPhoto(user, id, i, photoId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  /** E6-5 "Book again": the old order becomes the draft (R29-1 … R29-6). */
  @Post('orders/:id/rebook')
  @HttpCode(200)
  rebook(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { replace?: unknown }): Promise<BookingDraft> {
    return this.bookings.rebook(user, id, body?.replace === true);
  }
}
