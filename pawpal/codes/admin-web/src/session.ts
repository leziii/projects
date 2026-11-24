import { ADMIN_PAGES, ADMIN_PAGE_LABEL, canSeePage, type AdminPage, type AdminUser, type IconName } from '@pawpal/shared';

const TOKEN_KEY = 'pawpal.admin.token';

/** Admin login token, kept in this browser only (separate from the mobile app's token). */
export const getAdminToken = (): string => globalThis.localStorage?.getItem(TOKEN_KEY) ?? '';
export const setAdminToken = (token: string) => globalThis.localStorage?.setItem(TOKEN_KEY, token);
export const clearAdminToken = () => globalThis.localStorage?.removeItem(TOKEN_KEY);

/** Pages in menu order, each with its path; only those this admin may open. */
export const PAGE_PATH: Record<AdminPage, string> = { dashboard: '/', caregivers: '/caregivers', pets: '/pets', orders: '/orders', rules: '/rules', promos: '/promos', payments: '/payments', locations: '/locations', cases: '/cases', exceptions: '/exceptions', reviews: '/reviews', money: '/money', actions: '/actions', funnel: '/funnel', 'test-tools': '/test-tools' };

export const menuFor = (admin: Pick<AdminUser, 'pages'>) =>
  ADMIN_PAGES.filter((p) => canSeePage(admin, p)).map((p) => ({ page: p, path: PAGE_PATH[p], label: ADMIN_PAGE_LABEL[p] }));

/** Side menu sections (E16 redesign): each page sits in one group with an icon. */
export const MENU_GROUPS: { title: string; pages: { page: AdminPage; icon: IconName }[] }[] = [
  { title: 'Overview', pages: [{ page: 'dashboard', icon: 'grid' }, { page: 'funnel', icon: 'chart' }] },
  { title: 'Review', pages: [{ page: 'caregivers', icon: 'userCheck' }, { page: 'pets', icon: 'paw' }, { page: 'reviews', icon: 'star' }] },
  { title: 'Operations', pages: [{ page: 'orders', icon: 'orders' }, { page: 'exceptions', icon: 'alert' }, { page: 'cases', icon: 'messages' }, { page: 'locations', icon: 'pin' }] },
  { title: 'Money', pages: [{ page: 'money', icon: 'money' }, { page: 'payments', icon: 'card' }, { page: 'promos', icon: 'tag' }] },
  { title: 'Settings', pages: [{ page: 'rules', icon: 'sliders' }, { page: 'actions', icon: 'list' }, { page: 'test-tools', icon: 'tool' }] },
];

/** The side menu in sections; empty sections are left out. */
export function menuGroups(admin: Pick<AdminUser, 'pages'>) {
  return MENU_GROUPS.map((g) => ({
    title: g.title,
    items: g.pages.filter((p) => canSeePage(admin, p.page)).map((p) => ({ page: p.page, path: PAGE_PATH[p.page], label: ADMIN_PAGE_LABEL[p.page], icon: p.icon })),
  })).filter((g) => g.items.length);
}

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
