import { describe, expect, it } from 'vitest';
import { stripDcloudCss } from '../no-dcloud';

describe('no calls to DCloud servers', () => {
  it('removes the shadow images and their preload, keeps everything else', () => {
    const css =
      '.a{color:red}' +
      'body:after{position:fixed;content:"";animation:shadow-preload .1s;animation-delay:3s}' +
      '@keyframes shadow-preload{0%{background-image:url(https://cdn.dcloud.net.cn/img/shadow-grey.png)}to{background-image:url(https://cdn.dcloud.net.cn/img/shadow-grey.png)}}' +
      '.uni-page-head-shadow-grey:after{background-image:url(https://cdn.dcloud.net.cn/img/shadow-grey.png)}' +
      '@media (min-width:600px){.b{margin:0}}' +
      '.c{padding:1px}';
    expect(stripDcloudCss(css)).toBe('.a{color:red}@media (min-width:600px){.b{margin:0}}.c{padding:1px}');
    expect(stripDcloudCss('.x{a:b}')).toBe('.x{a:b}');
  });
});
