<template>
  <view class="content">
    <view class="card">
      <text class="section">Service report</text>
      <text class="note" data-test="report-later">Sending the report comes in E8-5. Your checklist and photos are saved.</text>
    </view>
    <button class="ghost" data-test="back-service" @click="back">Back to the service</button>
  </view>
</template>

<script setup lang="ts">
/** S12 placeholder until E8-5 (R36-5). */
function back() {
  uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/caregiver/tasks' }) });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
