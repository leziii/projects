<template>
  <view class="help-button" data-test="help-button" @click="open">
    <text>{{ label }}</text>
    <text class="go">WhatsApp ›</text>
  </view>
</template>

<script setup lang="ts">
import { supportInfo } from '@/api/support';
import { helpTarget } from '@/support';

/** Pass orderNo on order pages (O13) so support sees which order; nothing else goes in the text. */
const props = withDefaults(defineProps<{ orderNo?: string; label?: string }>(), { orderNo: undefined, label: 'Help & support' });

async function open() {
  const target = helpTarget(await supportInfo().catch(() => null), props.orderNo);
  if ('error' in target) {
    uni.showToast({ title: target.error, icon: 'none' });
    return;
  }
  window.open(target.link, '_blank');
}
</script>

<style>
.help-button { display: flex; justify-content: space-between; padding: 18rpx 0; }
.go { color: var(--pp-primary-strong); font-weight: 600; }
</style>
