<template>
  <view class="bottom-nav" data-test="bottom-nav">
    <view v-for="t in tabs" :key="t.key" class="tab" :class="{ on: t.key === active }" :data-test="`nav-${t.key}`" @click="go(t)">
      <PpIcon :name="t.icon" :size="24" :weight="t.key === active ? 2.3 : 2" />
      <text class="tab-label">{{ t.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Role } from '@pawpal/shared';
import PpIcon from '@/components/PpIcon.vue';
import { navTabs, type NavTab } from '@/bottom-nav';

const props = defineProps<{ role: Role; active: NavTab['key'] }>();
const tabs = computed(() => navTabs(props.role));

function go(t: NavTab) {
  if (t.key !== props.active) uni.reLaunch({ url: t.url });
}
</script>

<style>
.bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  display: flex; justify-content: space-around;
  padding: 12rpx 8rpx calc(12rpx + env(safe-area-inset-bottom));
  background: var(--pp-surface); border-top: 1px solid var(--pp-border);
}
.bottom-nav .tab { display: flex; flex-direction: column; align-items: center; gap: 6rpx; min-width: 128rpx; padding: 8rpx 0; color: var(--pp-muted); }
.bottom-nav .tab.on { color: var(--pp-primary-strong); }
.bottom-nav .tab-label { font-size: 22rpx; font-weight: 600; }
</style>
