import type { Plugin } from 'vite';

/** Top-level CSS rules (including @keyframes blocks) that load anything from DCloud's servers, or start that loading. */
const FROM_DCLOUD = /cdn\.dcloud\.net\.cn|shadow-preload/;

/**
 * Removes every top-level CSS rule that mentions DCloud's image server or its preload animation.
 * uni-app's built-in styles fetch page-header shadow images from cdn.dcloud.net.cn 3 s after a page opens;
 * PawPal never uses those shadows, and phones should not call a server outside our control.
 */
export function stripDcloudCss(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const rule = css.slice(i, end + 1);
    if (!FROM_DCLOUD.test(rule)) out += rule;
    i = end + 1;
  }
  return out;
}

/** Vite plugin: runs stripDcloudCss on every built CSS file. */
export function noDcloud(): Plugin {
  return {
    name: 'pawpal-no-dcloud',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') file.source = stripDcloudCss(file.source);
      }
    },
  };
}
