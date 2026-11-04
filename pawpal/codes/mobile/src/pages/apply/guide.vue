<template>
  <view v-if="guide" class="content">
    <text class="title">{{ guide.title }}</text>
    <view v-for="s in guide.sections" :key="s.heading" class="card">
      <text class="section">{{ s.heading }}</text>
      <text v-for="p in s.points" :key="p" class="point">· {{ p }}</text>
    </view>
    <text class="muted">Version {{ guide.version }}</text>
    <button class="primary" data-test="guide-done" @click="done">I have read the guide</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { CARE_GUIDE } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getCareGuide } from '@/api/apply';

const guide = ref<typeof CARE_GUIDE | null>(null);

onLoad(async () => {
  if (!(await requireUser('/pages/apply/guide'))) return;
  guide.value = await getCareGuide();
});

function done() {
  uni.$emit('care-guide-read');
  uni.navigateBack();
}
</script>

<style>
.content { padding: 32rpx; }
.title { display: block; font-size: 40rpx; font-weight: 700; margin-bottom: 24rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { display: block; font-weight: 700; font-size: 30rpx; margin-bottom: 8rpx; }
.point { display: block; font-size: 28rpx; margin-top: 10rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; margin-bottom: 24rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
