import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ChangeReviewController } from './change-review.controller';
import { ProfileController } from './profile.controller';
import { ProfilesService } from './profiles.service';
import { ReviewController } from './review.controller';
import { ScheduleController, ScheduleDevController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { CaregiverCardController, InsuranceController } from './trust.controller';
import { TrustService } from './trust.service';

@Module({
  controllers: [ApplicationsController, ReviewController, ProfileController, ChangeReviewController, ScheduleController, ScheduleDevController, CaregiverCardController, InsuranceController],
  providers: [ApplicationsService, ProfilesService, ScheduleService, TrustService],
  exports: [ApplicationsService, ProfilesService, ScheduleService, TrustService],
})
export class CaregiversModule {}
