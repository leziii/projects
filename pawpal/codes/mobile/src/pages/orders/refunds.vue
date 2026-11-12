<template>
  <view v-if="data" class="content">
    <view class="card">
      <text class="section">Order {{ data.number }}</text>
      <text class="strong" data-test="refund-summary">{{ refundSummaryText(data) }}</text>
      <text v-if="credit" class="note" data-test="credit-back">{{ credit }}</text>
    </view>

    <view class="card">
      <text class="section">Each refund</text>
      <view v-for="l in data.lines" :key="l.key" class="line" :data-test="`refund-${l.key}`">
        <view class="row">
          <text class="strong" :data-test="`reason-${l.key}`">{{ l.reason }}</text>
          <text class="strong" :data-test="`amount-${l.key}`">{{ formatRM(l.amountSen) }}</text>
        </view>
        <text :class="l.state === 'refunded' ? 'ok' : 'wait'" :data-test="`state-${l.key}`">{{ refundStateText(l) }}</text>
      </view>
      <text v-if="!data.lines.length" class="note" data-test="no-refunds">No money to send back on this order.</text>
    </view>

    <text class="note">Money usually reaches you in 3 to 7 working days. "Being processed" means we are sending it again for you; you do not need to do anything. We send you a message once it arrives.</text>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { creditBackText, formatRM, refundStateText, refundSummaryText, type OrderRefunds } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrderRefunds } from '@/api/booking';

/** E10-3 O16 (round 44): every refund of one order and where it is. */
const data = ref<OrderRefunds | null>(null);
const error = ref('');
let id = 0;

const credit = computed(() => (data.value ? creditBackText(data.value.creditBackSen) : null));

async function load() {
  try {
    data.value = await getOrderRefunds(id);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  if (!(await requireUser(`/pages/orders/refunds?id=${id}`))) return;
  await load();
});

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.row { display: flex; justify-content: space-between; align-items: center; }
.line { display: flex; flex-direction: column; gap: 4rpx; padding: 12rpx 0; border-bottom: 1px solid var(--pp-border); }
.note { font-size: 26rpx; color: var(--pp-muted); }
.ok { color: var(--pp-primary-strong); font-size: 26rpx; }
.wait { color: var(--pp-ink); font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
</style>
