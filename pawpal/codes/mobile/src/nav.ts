/** Pages that are a starting point: they need no back arrow. */
const ROOT_PAGES = ['/', '/pages/index/index', '/pages/caregiver/index', '/pages/login/index'];

/** True when a page opened as the first page should still get a back arrow (it leads to home). */
export function needsBackArrow(url: string | URL | null | undefined): boolean {
  if (!url) return false;
  const path = new URL(String(url), 'http://x').pathname.replace(/\/$/, '') || '/';
  return !ROOT_PAGES.includes(path);
}

type State = { __type__?: string } | null | undefined;

/**
 * uni-app H5 hides the back arrow on a page opened by reLaunch or redirectTo when it is the only page,
 * which leaves e.g. Messages after login with no way home. Such pages are marked as normal openings,
 * so the arrow shows and, with no page behind, goes to the home page.
 */
export function keepBackArrow(h: Pick<History, 'pushState' | 'replaceState'>): void {
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = h[name].bind(h);
    h[name] = (state: State, unused: string, url?: string | URL | null) => {
      const t = state?.__type__;
      const fixed = (t === 'reLaunch' || t === 'redirectTo') && needsBackArrow(url ?? location.href) ? { ...state, __type__: 'navigateTo' } : state;
      original(fixed, unused, url);
    };
  }
}
