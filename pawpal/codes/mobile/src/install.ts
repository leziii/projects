/** How to offer "Add PawPal to your home screen" (E1-5). */
export type InstallHint = 'installed' | 'ios' | 'prompt' | 'none';

/** iPhone/iPad Safari has no install button: show steps. Android/Chrome: show our button when the browser allows. */
export function installHint(userAgent: string, standalone: boolean, canPrompt: boolean): InstallHint {
  if (standalone) return 'installed';
  const ios = /iPhone|iPad|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  if (ios) return 'ios';
  return canPrompt ? 'prompt' : 'none';
}

/** True when PawPal already runs from the home screen. */
export function isStandalone(w: Window | undefined = globalThis.window): boolean {
  if (!w) return false;
  return w.matchMedia?.('(display-mode: standalone)').matches === true || (w.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Registers the service worker (install + push alerts). In development it caches nothing, so code is always fresh. */
export function registerServiceWorker(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (!nav || !('serviceWorker' in nav)) return false;
  nav.serviceWorker.register('/sw.js').catch(() => undefined);
  return true;
}
