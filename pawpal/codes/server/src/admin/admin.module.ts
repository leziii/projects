import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';

@Global()
@Module({ controllers: [AdminAuthController], providers: [AdminAuthService, AdminGuard], exports: [AdminAuthService, AdminGuard] })
export class AdminModule {}
