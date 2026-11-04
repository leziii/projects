import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { CodeSent, LoginResult, User } from '@pawpal/shared';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, bearer } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('code')
  @HttpCode(200)
  code(@Body() body: Record<string, unknown>): Promise<CodeSent> {
    return this.auth.sendCode(body ?? {});
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: Record<string, unknown>): Promise<LoginResult> {
    return this.auth.login(body ?? {});
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User): User {
    return user;
  }

  /** Switch this login between owner and caregiver (only approved caregivers may use caregiver). */
  @Post('role')
  @HttpCode(200)
  role(@Req() req: Request, @Body() body: { role?: unknown }): Promise<User> {
    return this.auth.switchRole(bearer(req), body?.role);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request): Promise<void> {
    await this.auth.logout(bearer(req));
  }
}
