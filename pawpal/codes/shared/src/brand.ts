/**
 * PawPal brand (E1-5): the only place colours, font and logo are defined.
 * KF chose option B "Trusted Teal" (25 Oct 2026). Apps read these tokens; no colour is hard-coded elsewhere.
 */

export interface BrandColors {
  /** Logo, highlights, large shapes. */
  primary: string;
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
}

export interface Brand {
  name: string;
  tagline: string;
  colors: BrandColors;
  /** CSS font stack; the first font is loaded from Google Fonts. */
  font: string;
  fontUrl: string;
  radius: { card: number; button: number };
  /** Square logo mark, 64×64 viewBox. Also the app icon. */
  logoSvg: string;
}

export const BRAND: Brand = {
  name: 'PawPal',
  tagline: 'Home pet care · Kuala Lumpur',
  colors: {
    primary: '#1F9E89',
    primaryStrong: '#147A69',
    background: '#EEF8F6',
    surface: '#FFFFFF',
    ink: '#14324A',
    muted: '#5B6B78',
    border: '#D6ECE8',
    accent: '#F5A623',
    success: '#1E8449',
    danger: '#C8423B',
  },
  font: "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap',
  radius: { card: 14, button: 999 },
  logoSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1F9E89"/>' +
    '<path d="M12 32 32 15l20 17v18H12z" fill="#FFFFFF"/><circle cx="32" cy="40" r="5" fill="#1F9E89"/>' +
    '<circle cx="25" cy="32" r="2.6" fill="#1F9E89"/><circle cx="30" cy="28" r="2.6" fill="#1F9E89"/>' +
    '<circle cx="35" cy="28" r="2.6" fill="#1F9E89"/><circle cx="40" cy="32" r="2.6" fill="#1F9E89"/></svg>',
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
