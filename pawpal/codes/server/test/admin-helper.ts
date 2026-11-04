import type { INestApplication } from '@nestjs/common';
import type { AdminPage } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { totpCode } from '../src/admin/totp';

export const TEST_ADMIN_PASSWORD = 'test-pass-2026';

/** A fresh admin with these pages (default all) and a login token. */
export async function adminLogin(app: INestApplication, pages?: AdminPage[]) {
  const service = app.get(AdminAuthService);
  const username = `t${randomInt(1e9)}`;
  const created = await service.create({ username, name: 'Test Admin', password: TEST_ADMIN_PASSWORD, pages });
  const { token } = await service.login({ username, password: TEST_ADMIN_PASSWORD, code: totpCode(created.totpSecret) });
  return { ...created, username, token, header: { authorization: `Bearer ${token}` } };
}
