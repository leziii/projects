import { Module } from '@nestjs/common';
import { InviteController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({ controllers: [InviteController], providers: [ReferralsService], exports: [ReferralsService] })
export class ReferralsModule {}
