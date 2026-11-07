import { ADMIN_PAGES, ADMIN_PAGE_LABEL, canSeePage, type AdminPage, type AdminUser } from '@pawpal/shared';

const TOKEN_KEY = 'pawpal.admin.token';

/** Admin login token, kept in this browser only (separate from the mobile app's token). */
export const getAdminToken = (): string => globalThis.localStorage?.getItem(TOKEN_KEY) ?? '';
export const setAdminToken = (token: string) => globalThis.localStorage?.setItem(TOKEN_KEY, token);
export const clearAdminToken = () => globalThis.localStorage?.removeItem(TOKEN_KEY);

/** Pages in menu order, each with its path; only those this admin may open. */
export const PAGE_PATH: Record<AdminPage, string> = { dashboard: '/', caregivers: '/caregivers', pets: '/pets', rules: '/rules', promos: '/promos', payments: '/payments', locations: '/locations', cases: '/cases', reviews: '/reviews', 'test-tools': '/test-tools' };

export const menuFor = (admin: Pick<AdminUser, 'pages'>) =>
  ADMIN_PAGES.filter((p) => canSeePage(admin, p)).map((p) => ({ page: p, path: PAGE_PATH[p], label: ADMIN_PAGE_LABEL[p] }));

/** Where a route goes: on, to login (no admin), or to the no-access page. */
export function routeDecision(admin: Pick<AdminUser, 'pages'> | null, page: AdminPage | undefined): 'ok' | 'login' | 'no-access' {
  if (!admin) return 'login';
  if (page && !canSeePage(admin, page)) return 'no-access';
  return 'ok';
}

/** After login: the page asked for if allowed, else the first page this admin may open. */
export function landingPath(admin: Pick<AdminUser, 'pages'>, redirect: string | undefined): string {
  const wanted = redirect && /^\/[a-z0-9/-]*$/.test(redirect) ? redirect : '';
  const page = (Object.keys(PAGE_PATH) as AdminPage[]).find((p) => PAGE_PATH[p] === wanted);
  if (wanted && wanted !== '/login' && (!page || canSeePage(admin, page))) return wanted;
  return menuFor(admin)[0]?.path ?? '/no-access';
}
