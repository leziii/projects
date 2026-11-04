import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { DevModule } from './dev/dev.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { MessagesModule } from './messages/messages.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { RulesModule } from './rules/rules.module';
import { SmsModule } from './sms/sms.module';
import { SupportModule } from './support/support.module';
import { FilesModule } from './files/files.module';
import { PetsModule } from './pets/pets.module';
import { AddressesModule } from './addresses/addresses.module';
import { BookingsModule } from './bookings/bookings.module';
import { PromosModule } from './promos/promos.module';
import { ReferralsModule } from './referrals/referrals.module';
import { CaregiversModule } from './caregivers/caregivers.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, RedisModule, SmsModule, FilesModule, HistoryModule, MessagesModule, AuthModule, AdminModule, AlertsModule, HealthModule, RulesModule, SupportModule, PetsModule, AddressesModule, CaregiversModule, PromosModule, ReferralsModule, BookingsModule, PaymentsModule, DevModule],
})
export class AppModule {}
