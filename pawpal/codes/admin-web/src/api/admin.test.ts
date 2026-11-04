import { describe, expect, it } from 'vitest';
import { adminLogin, adminLogout, currentAdmin } from './admin';

const admin = { id: 1, username: 'kf', name: 'KF', pages: ['rules'] };

describe('admin login api', () => {
  it('logs in, remembers the admin, logs out', async () => {
    const calls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url} ${init?.body ?? ''}`);
      if (url.endsWith('/logout')) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ token: 't', admin }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await adminLogin('kf', 'pass-word-1', '123456', fake)).toEqual(admin);
    expect(await currentAdmin(fake)).toEqual(admin); // remembered, no extra call
    await adminLogout(fake);
    expect(await currentAdmin(fake)).toBeNull();
    expect(calls).toEqual(['POST /api/admin/auth/login {"username":"kf","password":"pass-word-1","code":"123456"}', 'POST /api/admin/auth/logout {}']);
  });

  it('shows the server message for a wrong login', async () => {
    const fake = (async () => new Response(JSON.stringify({ code: 'ADMIN_LOGIN_FAILED', message: 'Wrong username, password or code' }), { status: 400 })) as unknown as typeof fetch;
    await expect(adminLogin('kf', 'x', '1', fake)).rejects.toThrow('Wrong username, password or code');
  });
});
