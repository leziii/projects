<template>
  <view v-if="order" class="content">
    <view class="card">
      <text class="title" :class="result.tone" data-test="result-title">{{ result.title }}</text>
      <text class="muted" data-test="result-body">{{ result.body }}</text>
    </view>
    <view class="card rows">
      <view class="row"><text class="muted">Order</text><view class="copyable" data-test="copy-number" @click="copyText(order.number, 'Order number copied')"><text data-test="order-number">{{ order.number }}</text><view class="copy-icon" aria-label="Copy" data-test="copy-icon"><view class="sheet back" /><view class="sheet front" /></view></view></view>
      <view class="row"><text class="muted">Caregiver</text><text data-test="order-caregiver">{{ order.caregiver.displayName }}</text></view>
      <view v-if="order.discountSen" class="row"><text class="muted">Promo {{ order.promoCode }}</text><text data-test="order-discount">−{{ formatRM(order.discountSen) }}</text></view>
      <view v-if="order.creditSen" class="row"><text class="muted">Credit</text><text data-test="order-credit">−{{ formatRM(order.creditSen) }}</text></view>
      <view class="row"><text class="muted">Paid</text><text data-test="order-amount">{{ formatRM(order.paySen) }}</text></view>
    </view>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button v-if="result.retry" class="primary" data-test="retry" @click="retry">Try again</button>
    <button v-if="canRebook(order)" class="primary" data-test="rebook" :disabled="busy" @click="rebook">Book again</button>
    <button v-if="order.status === 'pending_accept'" class="danger-ghost" data-test="withdraw" :disabled="busy" @click="withdraw">Withdraw booking</button>
    <button v-if="order.paidAt" class="ghost" data-test="view-order" @click="viewOrder">View order</button>
    <button v-if="stopped && result.tone === 'wait'" class="primary" data-test="check-again" @click="again">Check again</button>
    <button class="ghost" data-test="home" @click="home">Back to home</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onUnload } from '@dcloudio/uni-app';
import { REQUEST_RULES, RESULT_POLL, canRebook, formatRM, payResult, type OrderView } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrder } from '@/api/booking';
import { rebookWithConfirm, withdrawWithConfirm } from '@/order-actions';
import { CONFIRM_URL } from '@/booking';
import { copyText } from '@/copy';

const order = ref<OrderView | null>(null);
const stopped = ref(false);
const error = ref('');
const busy = ref(false);
const now = ref(new Date());
const result = computed(() => payResult(order.value!, now.value, stopped.value));
let id = 0;
let since = 0;
let asking = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** R27-4: the countdown moves every minute; at 0 the page asks the server again until the refund shows. */
const tick = setInterval(() => {
  if (order.value?.status !== 'pending_accept') return;
  now.value = new Date();
  // Ask again only when no round of asking is already running.
  if (result.value.polling && !asking) void again();
}, REQUEST_RULES.tickMs);

onLoad(async (q) => {
  id = Number(q?.id);
  if (!(await requireUser(`/pages/orders/result?id=${id}`))) return;
  await again();
});

onUnload(() => {
  clearTimeout(timer);
  clearInterval(tick);
});

/** Pull down: always the server's latest result (R22-2). */
onPullDownRefresh(async () => {
  await again();
  uni.stopPullDownRefresh();
});

async function again() {
  clearTimeout(timer);
  stopped.value = false;
  since = Date.now();
  asking = true;
  await refresh();
}

/** While the result is not known, ask every 3 s; stop after 2 min (R22-2). */
async function refresh() {
  order.value = await getOrder(id);
  now.value = new Date();
  if (!payResult(order.value, now.value).polling) {
    asking = false;
    return;
  }
  if (Date.now() - since >= RESULT_POLL.stopAfterMs) {
    stopped.value = true;
    asking = false;
  } else timer = setTimeout(() => void refresh(), RESULT_POLL.everyMs);
}

/** E6-4 (R28-1 … R28-6): if the caregiver got there first, say so and show the latest. */
async function withdraw() {
  error.value = '';
  busy.value = true;
  const outcome = await withdrawWithConfirm(id, order.value!.paySen);
  if (outcome !== 'cancelled') {
    error.value = outcome ?? '';
    order.value = await getOrder(id);
  }
  busy.value = false;
}

/** E6-5 (R29-1 … R29-5) */
async function rebook() {
  error.value = '';
  busy.value = true;
  error.value = (await rebookWithConfirm(id)) ?? '';
  busy.value = false;
}

/** R31-1 */
function viewOrder() {
  uni.navigateTo({ url: `/pages/orders/detail?id=${id}` });
}

/** Paying again uses the same order (R21-4); the method can be changed on O10 (R22-3). */
function retry() {
  uni.redirectTo({ url: CONFIRM_URL });
}

function home() {
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>

<style>
.content { display: flex; flex-direction: column; gap: 20rpx; padding: 32rpx; }
.card { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 48rpx 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); text-align: center; }
.rows { align-items: stretch; padding: 24rpx 32rpx; text-align: left; }
.row { display: flex; justify-content: space-between; font-size: 28rpx; }
.copyable { display: flex; gap: 16rpx; align-items: center; }
.title { font-size: 40rpx; font-weight: 700; }
.title.ok { color: var(--pp-primary-strong); }
.title.bad { color: var(--pp-danger); }
.muted { display: block; color: var(--pp-muted); font-size: 26rpx; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.danger-ghost { width: 100%; background: var(--pp-surface); color: var(--pp-danger); border: 1px solid var(--pp-danger); border-radius: var(--pp-radius-button); }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
</style>
