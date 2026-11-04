<template>
  <view v-if="order" class="content">
    <view class="card">
      <text class="badge">TEST PAYMENT · no real money</text>
      <text class="muted">PawPal order {{ order.number }}</text>
      <text class="amount" data-test="amount">{{ formatRM(order.paySen) }}</text>
      <text class="muted" data-test="method">{{ order.payment?.method ? PAYMENT_METHODS[order.payment.method] : '' }}</text>
    </view>
    <text class="muted center">The real payment page comes later. Pick what the bank should answer:</text>
    <button class="primary" data-test="outcome-success" :disabled="busy" @click="answer('success')">Pay (success)</button>
    <button class="ghost" data-test="outcome-failure" :disabled="busy" @click="answer('failure')">Fail</button>
    <button class="ghost" data-test="outcome-unknown" :disabled="busy" @click="answer('unknown')">Still checking</button>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { PAYMENT_METHODS, formatRM, type MockOutcome, type OrderView } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrder, testOutcome } from '@/api/booking';

const order = ref<OrderView | null>(null);
const paymentId = ref(0);
const busy = ref(false);
const error = ref('');

onLoad(async (q) => {
  if (!(await requireUser('/pages/booking/confirm'))) return;
  paymentId.value = Number(q?.payment);
  order.value = await getOrder(Number(q?.order));
});

async function answer(outcome: MockOutcome) {
  error.value = '';
  busy.value = true;
  try {
    await testOutcome(paymentId.value, outcome);
    uni.redirectTo({ url: `/pages/orders/result?id=${order.value!.id}` });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.content { display: flex; flex-direction: column; gap: 20rpx; padding: 32rpx; }
.card { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 40rpx 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.badge { padding: 4rpx 16rpx; border-radius: 999rpx; background: var(--pp-background); color: var(--pp-danger); font-size: 22rpx; font-weight: 700; }
.amount { font-size: 56rpx; font-weight: 700; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.center { text-align: center; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
</style>
