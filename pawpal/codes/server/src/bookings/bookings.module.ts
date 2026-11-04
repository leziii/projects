import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { CaregiversModule } from '../caregivers/caregivers.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromosModule } from '../promos/promos.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RequestsController, RequestsDevController } from './requests.controller';
import { RequestsService } from './requests.service';
import { VisitRunsService } from './visit-runs.service';

@Module({ imports: [AddressesModule, CaregiversModule, PaymentsModule, PromosModule, ReferralsModule], controllers: [BookingsController, OrdersController, RequestsController, RequestsDevController], providers: [BookingsService, OrdersService, RequestsService, VisitRunsService] })
export class BookingsModule {}
