import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, UseGuards, type RawBodyRequest } from '@nestjs/common';
import type { Payment } from '@pawpal/shared';
import type { Request } from 'express';
import { AdminGuard, ForPage } from '../admin/admin.guard';
import { PaymentsService, type WebhookResult } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ForPage('payments')
  list(): Promise<Payment[]> {
    return this.payments.list();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ForPage('payments')
  get(@Param('id', ParseIntPipe) id: number): Promise<Payment> {
    return this.payments.get(id);
  }

  @Post('charges')
  @UseGuards(AdminGuard)
  @ForPage('payments')
  charge(@Body() body: Record<string, unknown>): Promise<Payment> {
    return this.payments.createCharge(body ?? {});
  }

  @Post('refunds')
  @UseGuards(AdminGuard)
  @ForPage('payments')
  refund(@Body() body: Record<string, unknown>): Promise<Payment> {
    return this.payments.createRefund(body ?? {});
  }

  @Post('payouts')
  @UseGuards(AdminGuard)
  @ForPage('payments')
  payout(@Body() body: Record<string, unknown>): Promise<Payment> {
    return this.payments.createPayout(body ?? {});
  }

  /** Payer came back from the gateway page. Never decides the result (rule G7): only marks "checking". */
  @Post(':id/return')
  @HttpCode(200)
  returned(@Param('id', ParseIntPipe) id: number): Promise<Payment> {
    return this.payments.markChecking(id, { type: 'owner' }, 'Payer came back from the payment page; result not known yet');
  }

  @Post(':id/query')
  @UseGuards(AdminGuard)
  @ForPage('payments')
  @HttpCode(200)
  query(@Param('id', ParseIntPipe) id: number): Promise<Payment> {
    return this.payments.query(id);
  }

  @Post('webhooks/:gateway')
  @HttpCode(200)
  webhook(
    @Param('gateway') gateway: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ result: WebhookResult; paymentId: number | null }> {
    return this.payments.receiveWebhook(gateway, req.rawBody, req.headers);
  }
}
