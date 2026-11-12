import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { ExtraFee, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ExtraFeesService } from './extra-fees.service';

/** E11-3 O19 (round 47) */
@Controller('orders/:id/extra-fees')
@UseGuards(AuthGuard)
export class ExtraFeesController {
  constructor(private readonly fees: ExtraFeesService) {}

  @Get()
  list(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<ExtraFee[]> {
    return this.fees.forOrder(user, id);
  }

  @Post(':feeId/pay')
  @HttpCode(200)
  pay(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('feeId', ParseIntPipe) feeId: number, @Body() body: { method?: unknown }): Promise<{ fee: ExtraFee; paymentId: number }> {
    return this.fees.pay(user, id, feeId, body?.method);
  }

  @Post(':feeId/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('feeId', ParseIntPipe) feeId: number): Promise<ExtraFee> {
    return this.fees.decline(user, id, feeId);
  }
}
