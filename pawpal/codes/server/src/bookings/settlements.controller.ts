import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaregiverIncome, OrderSettlement, SettleResult, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser, NeedsRole } from '../auth/auth.guard';
import { SettlementsService } from './settlements.service';

/** E13-1 test tools (R53-6): finish an order's visits and settle it now instead of waiting. */
@Controller('dev')
export class SettlementsDevController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly config: ConfigService,
  ) {}

  private guard() {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
  }

  @Post('order-finish')
  @HttpCode(200)
  finish(@Body() body: { number?: unknown }): Promise<{ number: string; finished: number }> {
    this.guard();
    return this.settlements.finishNow(body?.number);
  }

  @Post('order-settled')
  @HttpCode(200)
  settle(@Body() body: { number?: unknown }): Promise<SettleResult> {
    this.guard();
    return this.settlements.settleNow(body?.number);
  }
}

/** E13-2 S15 (round 54): the caregiver's own income. */
@Controller('caregiver/income')
@UseGuards(AuthGuard)
export class IncomeController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @NeedsRole('caregiver')
  income(@CurrentUser() user: User): Promise<CaregiverIncome> {
    return this.settlements.income(user);
  }

  /** E13-3 S16 */
  @Get(':orderId')
  @NeedsRole('caregiver')
  detail(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number): Promise<OrderSettlement> {
    return this.settlements.detail(user, orderId);
  }
}
