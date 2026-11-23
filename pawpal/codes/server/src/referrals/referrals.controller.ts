import { Controller, Get, UseGuards } from '@nestjs/common';
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
