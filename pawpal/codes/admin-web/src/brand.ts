import { brandCssVars, elementPlusVars } from '@pawpal/shared';

type Root = { style: { setProperty(name: string, value: string): void } };

/** Puts the brand on the admin console: --pp-* variables plus the Element Plus theme. */
export function applyBrand(root: Root | undefined = globalThis.document?.documentElement) {
  if (!root) return;
  for (const [name, value] of Object.entries({ ...brandCssVars(), ...elementPlusVars() })) root.style.setProperty(name, value);
}
