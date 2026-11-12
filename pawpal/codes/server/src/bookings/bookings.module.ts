import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { CaregiversModule } from '../caregivers/caregivers.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromosModule } from '../promos/promos.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AdminCasesController, CasesController, CasesDevController } from './cases.controller';
import { CasesService } from './cases.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LocationFlagsController, RequestsController, RequestsDevController } from './requests.controller';
import { RequestsService } from './requests.service';
import { AdminReviewsController, ReviewsController } from './reviews.controller';
import { CancelController } from './cancel.controller';
import { CancelService } from './cancel.service';
import { ReviewsService } from './reviews.service';
import { OvertimeService } from './overtime.service';
import { ExtraFeesService } from './extra-fees.service';
import { ExtraFeesController } from './extra-fees.controller';
import { AdminRefundsController, RefundsController, RefundsDevController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { VisitRunsService } from './visit-runs.service';

@Module({ imports: [AddressesModule, CaregiversModule, PaymentsModule, PromosModule, ReferralsModule], controllers: [BookingsController, OrdersController, RequestsController, RequestsDevController, LocationFlagsController, CasesController, AdminCasesController, CasesDevController, ReviewsController, AdminReviewsController, CancelController, RefundsController, AdminRefundsController, RefundsDevController, ExtraFeesController], providers: [ExtraFeesService, OvertimeService, RefundsService, ReviewsService, CancelService, BookingsService, OrdersService, RequestsService, VisitRunsService, CasesService] })
export class BookingsModule {}
