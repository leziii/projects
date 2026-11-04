import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, User } from '@pawpal/shared';
import type { Request } from 'express';
import { AuthService } from './auth.service';

type AuthedRequest = Request & { user?: User };

const ROLE_KEY = 'pawpal:role';

/** "Authorization: Bearer <token>" → token. */
export function bearer(req: Request): string | undefined {
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  return m?.[1];
}

/** Route needs this role, e.g. @NeedsRole('caregiver'). Use together with AuthGuard. */
export const NeedsRole = (role: Role) => SetMetadata(ROLE_KEY, role);

/** Put @UseGuards(AuthGuard) on any route that needs a logged-in user (and @NeedsRole for a role). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user = await this.auth.userFor(bearer(req));
    const role = this.reflector.getAllAndOverride<Role | undefined>(ROLE_KEY, [ctx.getHandler(), ctx.getClass()]);
    // Caregiver actions need an approved caregiver (R14-4), whatever the request says.
    if (role === 'caregiver' && req.user.caregiverStatus !== 'approved') {
      throw new ForbiddenException({ code: 'NOT_APPROVED', message: 'Your caregiver application is not approved yet' });
    }
    if (role && req.user.activeRole !== role) {
      throw new ForbiddenException({ code: 'ROLE_REQUIRED', message: `Switch to the ${role} role to do this` });
    }
    return true;
  }
}

/** The logged-in user (only on routes with AuthGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user as User;
});
