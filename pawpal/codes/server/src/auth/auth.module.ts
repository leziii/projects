import { Global, Module } from '@nestjs/common';
import { ReferralsModule } from '../referrals/referrals.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({ imports: [ReferralsModule], controllers: [AuthController], providers: [AuthService, AuthGuard], exports: [AuthService, AuthGuard] })
export class AuthModule {}
