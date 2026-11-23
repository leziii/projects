import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderRefunds, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { RefundsService } from './refunds.service';

/** E10-3 O16 (round 44) */
@Controller('orders/:id/refunds')
@UseGuards(AuthGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<OrderRefunds> {
    return this.refunds.forOrder(user, id);
  }
}

/** Test tool: runs the refund retry as if this many minutes had passed (R44-4), without waiting. */
@Controller('dev')
export class RefundsDevController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly config: ConfigService,
  ) {}

  @Post('refunds-retry')
  @HttpCode(200)
  async retry(@Body() body: { minutesLater?: unknown }): Promise<{ sent: number }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    const later = Number(body?.minutesLater) || 0;
    return { sent: await this.refunds.retryFailed(new Date(Date.now() + later * 60_000)) };
  }
}
