<template>
  <view v-if="list" class="content">
    <text class="section">Waiting for you ({{ list.open.length }})</text>
    <view v-for="r in list.open" :key="r.orderId" class="card" data-test="request" @click="open(r.orderId)">
      <view class="row">
        <text class="tag" :class="{ urgent: r.urgent }" data-test="request-tag">{{ tagText(r) }}</text>
        <text class="left" data-test="request-left">{{ leftText(r, now) }}</text>
      </view>
      <text class="line" data-test="request-visits">{{ visitsText(r) }}</text>
      <text class="note" data-test="request-where">{{ whereText(r) }}</text>
      <view class="row">
        <text class="income" data-test="request-income">{{ incomeText(r) }}</text>
        <text class="link">›</text>
      </view>
    </view>
    <text v-if="!list.open.length" class="note" data-test="no-requests">No requests right now. New ones also come as alerts.</text>

    <text class="section past">History (last {{ REQUEST_RULES.historyDays }} days)</text>
    <view v-for="h in list.history" :key="h.orderId" class="card muted" data-test="history" @click="open(h.orderId)">
      <text class="strong" data-test="history-title">{{ historyText(h) }}</text>
      <text class="note">{{ visitsText(h) }} · {{ h.area }}</text>
    </view>
    <text v-if="!list.history.length" class="note" data-test="no-history">Nothing here yet.</text>
    <text class="note">Requests that expire or that the owner withdraws move here and can no longer be accepted.</text>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app';
import { REQUEST_RULES, type RequestList } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getRequests } from '@/api/requests';
import { anyExpired, historyText, incomeText, leftText, requestUrl, tagText, visitsText, whereText } from '@/requests';

const list = ref<RequestList | null>(null);
const error = ref('');
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    list.value = await getRequests();
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onShow(async () => {
  if (!(await requireUser('/pages/caregiver/requests'))) return;
  await load();
  // R25-5: time left updates every minute; at 0 the request moves to History.
  clearInterval(timer);
  timer = setInterval(() => {
    now.value = new Date();
    if (list.value && anyExpired(list.value.open, now.value)) void load();
  }, REQUEST_RULES.tickMs);
});
onHide(() => clearInterval(timer));
onUnload(() => clearInterval(timer));
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

function open(id: number) {
  uni.navigateTo({ url: requestUrl(id) });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.section { font-weight: 700; font-size: 32rpx; }
.past { margin-top: 24rpx; }
.card { padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card.muted { opacity: 0.75; }
.row { display: flex; justify-content: space-between; align-items: center; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.tag.urgent { background: var(--pp-danger); color: var(--pp-surface); }
.left { font-weight: 600; font-size: 26rpx; }
.line { display: block; margin-top: 12rpx; font-size: 28rpx; }
.income { margin-top: 8rpx; font-weight: 600; color: var(--pp-primary-strong); }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.strong { display: block; font-weight: 600; }
.note { display: block; font-size: 26rpx; color: var(--pp-muted); margin-top: 6rpx; }
.error { color: var(--pp-danger); }
</style>
