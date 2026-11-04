import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PAGE_LABEL, canSeePage, type AdminPage, type AdminUser } from '@pawpal/shared';
import type { Request } from 'express';
import { bearer } from '../auth/auth.guard';
import { AdminAuthService } from './admin-auth.service';

type AdminRequest = Request & { admin?: AdminUser };

const PAGE_KEY = 'pawpal:admin-page';

/** The admin page a route belongs to; the admin needs that page's permission. Without it, any admin may call. */
export const ForPage = (page: AdminPage) => SetMetadata(PAGE_KEY, page);

/** Put @UseGuards(AdminGuard) on admin routes: needs an admin login (never an app login) and the page permission. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    req.admin = await this.auth.adminFor(bearer(req));
    const page = this.reflector.getAllAndOverride<AdminPage | undefined>(PAGE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (page && !canSeePage(req.admin, page)) {
      throw new ForbiddenException({ code: 'PAGE_FORBIDDEN', message: `You have no access to ${ADMIN_PAGE_LABEL[page]}` });
    }
    return true;
  }
}

/** The logged-in admin (only on routes with AdminGuard). */
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminUser => {
  return ctx.switchToHttp().getRequest<AdminRequest>().admin as AdminUser;
});
