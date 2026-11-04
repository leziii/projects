import { Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InviteInfo, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ReferralsService } from './referrals.service';

/** Me → Invite friends (C03). */
@Controller('invite')
@UseGuards(AuthGuard)
export class InviteController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  invite(@CurrentUser() user: User): Promise<InviteInfo> {
    return this.referrals.invite(user);
  }
}

/** Test tool until settlement is built (E8/E9): mark an order settled by its number (R24-4). */
@Controller('dev')
export class ReferralsDevController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly config: ConfigService,
  ) {}

  @Post('order-settled')
  @HttpCode(200)
  settled(@Body() body: { number?: unknown }): Promise<{ number: string; rewarded: boolean }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    return this.referrals.settleByNumber(body?.number);
  }
}
