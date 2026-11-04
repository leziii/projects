import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('uni', {
  getStorageSync: (k: string) => store.get(k) ?? '',
  setStorageSync: (k: string, v: string) => store.set(k, v),
  removeStorageSync: (k: string) => store.delete(k),
  redirectTo: vi.fn(),
});

const { api, ApiError, getToken, setToken } = await import('./client');
const { loginUrl } = await import('./auth');

describe('mobile API client', () => {
  beforeEach(() => store.clear());

  it('sends the login token and returns the data', async () => {
    setToken('abc');
    const send = vi.fn(async () => ({ statusCode: 200, data: { id: 1 } }));
    expect(await api('/auth/me', undefined, send)).toEqual({ id: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', header: expect.objectContaining({ authorization: 'Bearer abc' }) }));
  });

  it('turns server errors into ApiError with the code', async () => {
    const send = async () => ({ statusCode: 400, data: { code: 'CODE_WRONG', message: 'Wrong code. 4 tries left' } });
    await expect(api('/auth/login', {}, send)).rejects.toEqual(new ApiError('CODE_WRONG', 'Wrong code. 4 tries left', 400));
  });

  it('forgets the token when the server says 401', async () => {
    setToken('old');
    await expect(api('/auth/me', undefined, async () => ({ statusCode: 401, data: {} }))).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBe('');
  });

  it('explains when the server cannot be reached', async () => {
    await expect(api('/x', undefined, () => Promise.reject(new Error('net')))).rejects.toMatchObject({ code: 'OFFLINE' });
  });

  it('login link brings you back to where you were', () => {
    expect(loginUrl('/pages/me/index')).toBe('/pages/login/index?redirect=%2Fpages%2Fme%2Findex');
    expect(loginUrl('https://evil.example')).toBe('/pages/login/index?redirect=%2Fpages%2Findex%2Findex');
  });
});
