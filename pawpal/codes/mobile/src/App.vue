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
/* Copy icon: two overlapping sheets, drawn with CSS so no image is needed. */
.copy-icon { position: relative; width: 36rpx; height: 36rpx; flex-shrink: 0; }
.copy-icon .sheet { position: absolute; width: 22rpx; height: 26rpx; border: 3rpx solid var(--pp-primary-strong); border-radius: 5rpx; background: var(--pp-surface); }
.copy-icon .back { left: 0; top: 0; }
.copy-icon .front { left: 9rpx; top: 7rpx; }
</style>
