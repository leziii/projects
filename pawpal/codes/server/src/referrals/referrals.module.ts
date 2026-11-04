import { Module } from '@nestjs/common';
import { InviteController, ReferralsDevController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({ controllers: [InviteController, ReferralsDevController], providers: [ReferralsService], exports: [ReferralsService] })
export class ReferralsModule {}
