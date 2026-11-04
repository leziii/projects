<template>
  <view v-if="order" class="content">
    <view class="card">
      <view class="row">
        <view class="copyable" data-test="copy-number" @click="copyText(order.number, 'Order number copied')">
          <text class="strong" data-test="order-number">{{ order.number }}</text>
          <view class="copy-icon" aria-label="Copy" data-test="copy-icon"><view class="sheet back" /><view class="sheet front" /></view>
        </view>
        <text class="tag" :class="result.tone" data-test="order-tag">{{ orderTag(order) }}</text>
      </view>
      <text class="line" data-test="order-caregiver">Caregiver: {{ order.caregiver.displayName }}</text>
      <text class="note" data-test="order-status">{{ result.body }}</text>
    </view>

    <view class="card">
      <text class="section">Visits ({{ order.visits.length }})</text>
      <view v-for="(v, i) in order.visits" :key="`${v.date}-${v.start}`" class="visit" data-test="visit" @click="openVisit(i)">
        <view class="row">
          <text class="strong" data-test="visit-when">{{ visitWhen(v) }}</text>
          <text class="tag" :class="result.tone" data-test="visit-status">{{ visitStatus(order, order.runs[i]) }}</text>
        </view>
        <view class="row">
          <text class="note" data-test="visit-price">{{ v.quote.totalMinutes }} min · paid {{ formatRM(v.paidSen) }}</text>
          <text class="link">Details ›</text>
        </view>
      </view>
      <text class="note" data-test="order-pets">For {{ order.pets.map((p) => p.name).join(', ') }}</text>
    </view>

    <view class="card">
      <text class="section">Payment</text>
      <view class="row"><text class="note">Price</text><text data-test="order-total">{{ formatRM(order.totalSen) }}</text></view>
      <view v-if="order.discountSen" class="row"><text class="note">Promo {{ order.promoCode }}</text><text data-test="order-discount">−{{ formatRM(order.discountSen) }}</text></view>
      <view v-if="order.creditSen" class="row"><text class="note">Credit</text><text data-test="order-credit">−{{ formatRM(order.creditSen) }}</text></view>
      <view class="row"><text class="strong">Paid</text><text class="strong" data-test="order-paid">{{ formatRM(order.paySen) }}</text></view>
    </view>
    <view v-if="refund" class="card" data-test="refund">
      <text class="section">Refund</text>
      <text :class="refundDone ? 'ok' : 'wait'" data-test="refund-line">{{ refund }}</text>
    </view>

    <view class="card">
      <text class="section">Where and getting in</text>
      <text v-if="order.address" class="line" data-test="order-address">{{ order.address.unit }}, {{ order.address.street }}, {{ order.address.postcode }} {{ order.address.area }}</text>
      <text class="line" data-test="order-entry">{{ ENTRY_METHOD_LABEL[order.entryMethod].title }}</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button v-if="canRebook(order)" class="primary" data-test="rebook" :disabled="busy" @click="rebook">Book again</button>
    <button v-if="order.status === 'pending_accept'" class="danger-ghost" data-test="withdraw" :disabled="busy" @click="withdraw">Withdraw booking</button>
    <view class="card"><HelpButton :order-no="order.number" label="Help with this order" /></view>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app';
import { ENTRY_METHOD_LABEL, REQUEST_RULES, canRebook, formatRM, orderTag, payResult, refundLine, visitStatus, visitWhen, type OrderDetail } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrderDetail } from '@/api/booking';
import HelpButton from '@/components/HelpButton.vue';
import { copyText } from '@/copy';
import { rebookWithConfirm, withdrawWithConfirm } from '@/order-actions';

const order = ref<OrderDetail | null>(null);
const error = ref('');
const busy = ref(false);
const now = ref(new Date());
const result = computed(() => payResult(order.value!, now.value));
const refund = computed(() => (order.value ? refundLine(order.value) : null));
const refundDone = computed(() => !!order.value && order.value.refundDoneSen >= order.value.refundSen);
let id = 0;

/** R31-2: the countdown moves every minute; once time is up, ask the server again. */
const tick = setInterval(() => {
  if (order.value?.status !== 'pending_accept') return;
  now.value = new Date();
  if (result.value.polling) void load();
}, REQUEST_RULES.tickMs);

async function load() {
  try {
    order.value = await getOrderDetail(id);
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad((q) => {
  id = Number(q?.id) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/orders/detail?id=${id}`))) return;
  await load();
});
onUnload(() => clearInterval(tick));
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

async function withdraw() {
  error.value = '';
  busy.value = true;
  const outcome = await withdrawWithConfirm(id, order.value!.paySen);
  if (outcome !== 'cancelled') {
    await load();
    error.value = outcome ?? '';
  }
  busy.value = false;
}

/** R32-1 */
function openVisit(i: number) {
  uni.navigateTo({ url: `/pages/orders/visit?id=${id}&i=${i}` });
}

async function rebook() {
  error.value = '';
  busy.value = true;
  error.value = (await rebookWithConfirm(id)) ?? '';
  busy.value = false;
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; }
.copyable { display: flex; gap: 16rpx; align-items: center; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.visit { display: flex; flex-direction: column; gap: 4rpx; padding: 12rpx 0; border-bottom: 1px solid var(--pp-border); }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); }
.ok { color: var(--pp-primary-strong); }
.wait { color: var(--pp-ink); }
.bad { color: var(--pp-danger); }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.danger-ghost { width: 100%; background: var(--pp-surface); color: var(--pp-danger); border: 1px solid var(--pp-danger); border-radius: var(--pp-radius-button); }
</style>
