<template>
  <view v-if="order && visit" class="content">
    <view class="card">
      <view class="row">
        <text class="strong" data-test="visit-when">{{ visitWhen(visit) }}</text>
        <text class="tag" :class="result.tone" data-test="visit-status">{{ visitStatus(order, run) }}</text>
      </view>
      <text class="note" data-test="visit-service">{{ serviceText(order.level, visit.quote) }} · {{ order.number }}</text>
    </view>

    <view class="card">
      <text class="section">Time</text>
      <view class="row"><text class="note">Planned</text><text data-test="visit-planned">{{ plannedTime(visit) }}</text></view>
      <view class="row"><text class="note">Actual</text><text :class="{ later: !run.arrivedAt }" data-test="visit-actual">{{ run.arrivedAt ? arrivedText(run.arrivedAt) : AFTER_VISIT }}</text></view>
      <text v-if="run.locationRecorded" class="note" data-test="location-recorded">📍 Location recorded</text>
      <view class="row"><text class="note">Caregiver</text><text data-test="visit-caregiver">{{ order.caregiver.displayName }}</text></view>
    </view>

    <view class="card">
      <text class="section">Getting in</text>
      <view class="row"><text class="note">Method</text><text data-test="visit-entry">{{ ENTRY_METHOD_LABEL[order.entryMethod].title }}</text></view>
      <view class="row"><text class="note">Handover</text><text :class="{ later: !run.enteredAt }" data-test="visit-handover">{{ run.enteredAt ? enteredText(run.enteredAt, run.enteredBy!, 'owner') : AFTER_VISIT }}</text></view>
      <template v-if="canConfirm">
        <text class="strong" data-test="arrived-note">{{ order.caregiver.displayName }} has arrived. Confirm to let them in.</text>
        <button class="primary" data-test="confirm-entry" :disabled="busy" @click="confirm">Confirm {{ order.caregiver.displayName }} is in</button>
      </template>
      <text v-if="actionError" class="error" data-test="action-error">{{ actionError }}</text>
    </view>

    <view class="card">
      <text class="section">Report</text>
      <template v-if="run.reportedAt">
        <text class="strong" data-test="visit-report">{{ reportLine }}</text>
        <button class="primary" data-test="view-report" @click="viewReport">View report</button>
      </template>
      <text v-else class="later" data-test="visit-report">{{ AFTER_VISIT }}</text>
    </view>

    <view class="card">
      <text class="section">This visit's price</text>
      <view v-for="l in visitPriceLines(visit)" :key="l.label" class="row" data-test="visit-fee"><text class="note">{{ l.label }}</text><text>{{ formatRM(l.sen) }}</text></view>
      <view class="row"><text class="strong">Paid</text><text class="strong" data-test="visit-paid">{{ formatRM(visit.paidSen) }}</text></view>
      <text v-if="visit.paidSen < visit.quote.total" class="note">After your promo and credit.</text>
    </view>

    <view class="card"><HelpButton :order-no="order.number" label="Help with this visit" /></view>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  AFTER_VISIT,
  ENTRY_METHOD_LABEL,
  NOT_STARTED,
  arrivedText,
  confirmedText,
  enteredText,
  formatRM,
  payResult,
  plannedTime,
  reportReadyText,
  serviceText,
  visitPriceLines,
  visitStatus,
  visitWhen,
  type OrderDetail,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { confirmEntry, getOrderDetail } from '@/api/booking';
import HelpButton from '@/components/HelpButton.vue';

const order = ref<OrderDetail | null>(null);
const error = ref('');
let id = 0;
let index = 0;
const visit = computed(() => order.value?.visits[index] ?? null);
const result = computed(() => payResult(order.value!, new Date()));
const run = computed(() => order.value?.runs[index] ?? NOT_STARTED);
/** R35-4: Live confirm, the caregiver is at the door. */
const canConfirm = computed(() => order.value?.status === 'accepted' && order.value.entryMethod === 'live_confirm' && run.value.status === 'arrived');
const busy = ref(false);
const actionError = ref('');

async function load() {
  try {
    order.value = await getOrderDetail(id);
    if (!visit.value) error.value = 'Visit not found';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

/** R39-1, R40-1 … R40-3 */
const reportLine = computed(() => {
  const r = run.value;
  if (r.status === 'confirmed') return confirmedText(r.confirmedAt!, r.confirmedBy!, 'owner');
  if (r.status === 'disputed') return 'Under review: you raised a problem';
  return reportReadyText(r.reportedAt!, new Date());
});

const viewReport = () => uni.navigateTo({ url: `/pages/orders/report?id=${id}&i=${index}` });

async function confirm() {
  busy.value = true;
  actionError.value = '';
  try {
    order.value = await confirmEntry(id, index);
  } catch (e) {
    actionError.value = (e as Error).message;
    await load();
  } finally {
    busy.value = false;
  }
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/orders/visit?id=${id}&i=${index}`))) return;
  await load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.later { font-size: 26rpx; color: var(--pp-muted); font-style: italic; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); }
.ok { color: var(--pp-primary-strong); }
.wait { color: var(--pp-ink); }
.bad { color: var(--pp-danger); }
.error { color: var(--pp-danger); }
.primary { width: 100%; margin-top: 8rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
