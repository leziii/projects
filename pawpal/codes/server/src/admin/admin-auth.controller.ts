import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { AdminLoginResult, AdminUser } from '@pawpal/shared';
import type { Request } from 'express';
import { bearer } from '../auth/auth.guard';
import { AdminGuard, CurrentAdmin } from './admin.guard';
import { AdminAuthService } from './admin-auth.service';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: Record<string, unknown>): Promise<AdminLoginResult> {
    return this.auth.login(body ?? {});
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminUser): AdminUser {
    return admin;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request): Promise<void> {
    await this.auth.logout(bearer(req));
  }
}
