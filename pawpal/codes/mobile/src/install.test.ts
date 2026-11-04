import { describe, expect, it, vi } from 'vitest';
import { installHint, isStandalone, registerServiceWorker } from './install';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = IPHONE.replace('Version/18.0', 'CriOS/130.0');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('install hint', () => {
  it('nothing to offer once installed', () => {
    expect(installHint(IPHONE, true, false)).toBe('installed');
    expect(installHint(ANDROID, true, true)).toBe('installed');
  });

  it('iPhone Safari gets "Share → Add to Home Screen" steps', () => {
    expect(installHint(IPHONE, false, false)).toBe('ios');
  });

  it('other iPhone browsers cannot install, so nothing is shown', () => {
    expect(installHint(IPHONE_CHROME, false, false)).toBe('none');
  });

  it('Android shows our button only when the browser allows it', () => {
    expect(installHint(ANDROID, false, true)).toBe('prompt');
    expect(installHint(ANDROID, false, false)).toBe('none');
  });

  it('knows when it runs from the home screen', () => {
    const w = (standalone: boolean) => ({ matchMedia: () => ({ matches: standalone }), navigator: {} }) as unknown as Window;
    expect(isStandalone(w(true))).toBe(true);
    expect(isStandalone(w(false))).toBe(false);
    expect(isStandalone(undefined)).toBe(false);
  });
});

describe('service worker', () => {
  it('registers when the browser supports it', () => {
    const register = vi.fn(() => Promise.resolve());
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    expect(registerServiceWorker(nav)).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(registerServiceWorker({} as Navigator)).toBe(false);
  });
});
