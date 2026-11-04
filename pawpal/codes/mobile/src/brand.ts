import { brandCssVars } from '@pawpal/shared';

/** Puts the brand colours, font and radius on the page as CSS variables (--pp-*). */
export function applyBrand(root: { style: { setProperty(name: string, value: string): void } } | undefined = globalThis.document?.documentElement) {
  if (!root) return;
  for (const [name, value] of Object.entries(brandCssVars())) root.style.setProperty(name, value);
}
