const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';
export const apiBase = () => API_BASE;
const TOKEN_KEY = 'pawpal.token';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    /** The whole error body, for fields beyond code and message. */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Reply {
  statusCode: number;
  data: unknown;
}
export type Requester = (opts: { url: string; method: 'GET' | 'POST'; data?: object; header: Record<string, string> }) => Promise<Reply>;

const uniRequest: Requester = (opts) =>
  new Promise((resolve, reject) =>
    uni.request({ ...opts, success: (r) => resolve({ statusCode: r.statusCode, data: r.data }), fail: (e) => reject(new Error(e.errMsg)) }),
  );

export const getToken = (): string => uni.getStorageSync(TOKEN_KEY) || '';
export const setToken = (token: string) => uni.setStorageSync(TOKEN_KEY, token);
export const clearToken = () => uni.removeStorageSync(TOKEN_KEY);

/** Calls the server with the login token. Errors become ApiError with the server's code; 401 also forgets the token. */
export async function api<T>(path: string, data?: object, send: Requester = uniRequest): Promise<T> {
  const token = getToken();
  let reply: Reply;
  try {
    reply = await send({
      url: `${API_BASE}/api${path}`,
      method: data ? 'POST' : 'GET',
      data,
      header: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError('OFFLINE', 'Cannot reach PawPal. Check your connection', 0);
  }
  if (reply.statusCode >= 200 && reply.statusCode < 300) return reply.data as T;
  if (reply.statusCode === 401) clearToken();
  const body = (reply.data ?? {}) as { code?: string; message?: string };
  throw new ApiError(body.code ?? `HTTP_${reply.statusCode}`, body.message ?? 'Something went wrong', reply.statusCode, body);
}
