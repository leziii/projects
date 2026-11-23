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
import { AdminProblemsController, ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';
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
import { RefundsController, RefundsDevController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { VisitRunsService } from './visit-runs.service';

import { AdminExceptionsController } from './exceptions.controller';
import { ExceptionsService } from './exceptions.service';
import { AdminSubstitutesController, SubstitutesController, SubstitutesDevController } from './substitutes.controller';
import { SubstitutesService } from './substitutes.service';
import { IncomeController, SettlementsDevController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { AdminMoneyController } from './money.controller';
import { MoneyService } from './money.service';
@Module({ imports: [AddressesModule, CaregiversModule, PaymentsModule, PromosModule, ReferralsModule], controllers: [BookingsController, OrdersController, RequestsController, RequestsDevController, LocationFlagsController, CasesController, AdminCasesController, CasesDevController, ReviewsController, AdminReviewsController, CancelController, RefundsController, RefundsDevController, ExtraFeesController, ProblemsController, AdminProblemsController, AdminExceptionsController, AdminSubstitutesController, SubstitutesController, SubstitutesDevController, SettlementsDevController, IncomeController, AdminMoneyController], providers: [ExtraFeesService, OvertimeService, RefundsService, ReviewsService, CancelService, BookingsService, OrdersService, RequestsService, VisitRunsService, CasesService, ProblemsService, ExceptionsService, SubstitutesService, SettlementsService, MoneyService], exports: [ExceptionsService, CasesService, ProblemsService, MoneyService] })
export class BookingsModule {}
