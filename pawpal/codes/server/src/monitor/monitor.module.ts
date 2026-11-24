import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BookingsModule } from '../bookings/bookings.module';
import { ErrorInterceptor } from './error.interceptor';
import { FunnelService } from './funnel.service';
import { MoneyAlertsService } from './money-alerts.service';
import { AdminFunnelController, FunnelController, MonitorDevController } from './monitor.controller';

/** E15-3 (round 61): error tracking, money alerts and the booking funnel. */
@Module({
  imports: [BookingsModule],
  controllers: [FunnelController, AdminFunnelController, MonitorDevController],
  providers: [FunnelService, MoneyAlertsService, { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor }],
  exports: [MoneyAlertsService],
})
export class MonitorModule {}
