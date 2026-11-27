/**
 * PawPal brand (E1-5): the only place colours, font and logo are defined.
 * KF chose "Honey & Tan" (24 Nov 2026), replacing "Trusted Teal". Apps read these tokens; no colour is hard-coded elsewhere.
 */

export interface BrandColors {
  /** Logo, highlights, large shapes (dark text on it). */
  primary: string;
  /** Soft tint of primary: icon tiles, selected items, info boxes. */
  primarySoft: string;
  /** Buttons, links and text on light backgrounds (readable: contrast ≥ 4.5). */
  primaryStrong: string;
  /** Page background. */
  background: string;
  /** Cards and inputs. */
  surface: string;
  /** Main text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Lines between items. */
  border: string;
  /** Small highlights such as "urgent". */
  accent: string;
  success: string;
  danger: string;
  /** "Upcoming" and other neutral status tags. */
  info: string;
}

export interface Brand {
  name: string;
  tagline: string;
  colors: BrandColors;
  /** CSS font stack; the first font is loaded from Google Fonts. */
  font: string;
  fontUrl: string;
  radius: { card: number; button: number };
  /** Shadow under cards and bars: none, cards use a thin border (plainer look, 27 Nov 2026). */
  shadow: string;
  /** Square logo mark, 64×64 viewBox. Also the app icon. */
  logoSvg: string;
}

export const BRAND: Brand = {
  name: 'PawPal',
  tagline: 'Home pet care · Kuala Lumpur',
  colors: {
    primary: '#E8B65C',
    primarySoft: '#F6E7C8',
    primaryStrong: '#8A5A22',
    background: '#F6F1E8',
    surface: '#FFFFFF',
    ink: '#2E2218',
    muted: '#7A6550',
    border: '#EADFCC',
    accent: '#F4A261',
    success: '#3D7A4A',
    danger: '#B4443A',
    info: '#2F5C8F',
  },
  font: "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  radius: { card: 10, button: 8 },
  shadow: 'none',
  logoSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#E8B65C"/>' +
    '<path d="M12 32 32 15l20 17v18H12z" fill="#FFFFFF"/><circle cx="32" cy="40" r="5" fill="#8A5A22"/>' +
    '<circle cx="25" cy="32" r="2.6" fill="#8A5A22"/><circle cx="30" cy="28" r="2.6" fill="#8A5A22"/>' +
    '<circle cx="35" cy="28" r="2.6" fill="#8A5A22"/><circle cx="40" cy="32" r="2.6" fill="#8A5A22"/></svg>',
};

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mixes colour a with colour b; weight 0 = a, 1 = b. */
export function mixColor(a: string, b: string, weight: number): string {
  const [ca, cb] = [rgb(a), rgb(b)];
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * weight).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** CSS custom properties for the apps: --pp-primary, --pp-font, ... */
export function brandCssVars(brand: Brand = BRAND): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(brand.colors)) vars[`--pp-${kebab(key)}`] = value;
  vars['--pp-font'] = brand.font;
  vars['--pp-radius-card'] = `${brand.radius.card}px`;
  vars['--pp-radius-button'] = `${brand.radius.button}px`;
  vars['--pp-shadow'] = brand.shadow;
  return vars;
}

/** Element Plus theme variables (admin console), derived from the brand. */
export function elementPlusVars(brand: Brand = BRAND): Record<string, string> {
  const c = brand.colors;
  const vars: Record<string, string> = {
    '--el-color-primary': c.primaryStrong,
    '--el-color-primary-dark-2': mixColor(c.primaryStrong, '#000000', 0.2),
    '--el-color-success': c.success,
    '--el-color-warning': c.accent,
    '--el-color-danger': c.danger,
    '--el-color-error': c.danger,
    '--el-text-color-primary': c.ink,
    '--el-text-color-regular': c.ink,
    '--el-font-family': brand.font,
  };
  for (const step of [3, 5, 7, 8, 9]) vars[`--el-color-primary-light-${step}`] = mixColor(c.primaryStrong, '#FFFFFF', step / 10);
  return vars;
}

/** The logo as a data: URL, for <img src>. */
export function logoDataUrl(brand: Brand = BRAND): string {
  return `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}`;
}

function rgb(hex: string): number[] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** The web app manifest that lets phones install PawPal on the home screen (PWA). */
export function webManifest(brand: Brand = BRAND) {
  const icon = (src: string, size: number, purpose: 'any' | 'maskable') => ({ src, sizes: `${size}x${size}`, type: 'image/png', purpose });
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: brand.colors.background,
    theme_color: brand.colors.primary,
    icons: [
      icon('/static/icons/icon-192.png', 192, 'any'),
      icon('/static/icons/icon-512.png', 512, 'any'),
      icon('/static/icons/maskable-512.png', 512, 'maskable'),
    ],
  };
}

/** Tags for <head>: theme colour, iPhone install, icons, font. */
export function headTags(brand: Brand = BRAND, appTitle = brand.name): string {
  return [
    `<meta name="theme-color" content="${brand.colors.primary}">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="${appTitle}">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="stylesheet" href="${brand.fontUrl}">`,
  ].join('\n    ');
}
