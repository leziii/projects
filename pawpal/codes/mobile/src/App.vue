<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { applyBrand } from './brand';
import { registerServiceWorker } from './install';

onLaunch(() => {
  applyBrand();
  registerServiceWorker();
});
</script>

<style>
/* Brand values come from shared/src/brand.ts as --pp-* variables (set in applyBrand). */
page,
body {
  background: var(--pp-background);
  color: var(--pp-ink);
  font-family: var(--pp-font);
}
/* Shared look (Honey & Tan, 24 Nov 2026). Pages keep their own layout; these rules give every page
   the same cards, buttons and header. "uni-page-body" makes them win over a page's own .card rule. */
uni-page-head .uni-page-head { box-shadow: 0 1px 0 var(--pp-border); }
uni-page-head .uni-page-head__title { font-weight: 700; font-size: 17px; }
uni-page-body .card { border-color: transparent; box-shadow: var(--pp-shadow); }
uni-page-body button { font-family: inherit; }
uni-page-body button::after { border: none; }
uni-page-body button.primary { min-height: 96rpx; line-height: 96rpx; font-weight: 700; }
uni-page-body button.primary[disabled] { opacity: 0.45; background: var(--pp-primary-strong); color: var(--pp-surface); }
uni-page-body input, uni-page-body textarea, uni-page-body select { border-radius: 24rpx; }
/* Status tags: soft tint + strong text, one colour per meaning. */
.pp-tag { display: inline-block; padding: 6rpx 20rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 700; white-space: nowrap; }
.pp-tag.ok { background: color-mix(in srgb, var(--pp-success) 14%, var(--pp-surface)); color: var(--pp-success); }
.pp-tag.wait { background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.pp-tag.info { background: color-mix(in srgb, var(--pp-info) 12%, var(--pp-surface)); color: var(--pp-info); }
.pp-tag.bad { background: color-mix(in srgb, var(--pp-danger) 13%, var(--pp-surface)); color: var(--pp-danger); }
.pp-tag.off { background: color-mix(in srgb, var(--pp-muted) 14%, var(--pp-surface)); color: var(--pp-muted); }
/* Leaves room for the bottom navigation bar. */
.with-nav { padding-bottom: calc(180rpx + env(safe-area-inset-bottom)) !important; }
/* Copy icon: two overlapping sheets, drawn with CSS so no image is needed. */
.copy-icon { position: relative; width: 36rpx; height: 36rpx; flex-shrink: 0; }
.copy-icon .sheet { position: absolute; width: 22rpx; height: 26rpx; border: 3rpx solid var(--pp-primary-strong); border-radius: 5rpx; background: var(--pp-surface); }
.copy-icon .back { left: 0; top: 0; }
.copy-icon .front { left: 9rpx; top: 7rpx; }
</style>
