import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [BookingsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
