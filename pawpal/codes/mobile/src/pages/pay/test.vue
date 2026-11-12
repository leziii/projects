<template>
  <view v-if="order" class="content">
    <view class="card">
      <text class="badge">TEST PAYMENT · no real money</text>
      <text class="muted">PawPal order {{ order.number }}<text v-if="fee"> · {{ extraFeeTitle(fee) }}</text></text>
      <text class="amount" data-test="amount">{{ formatRM(fee ? fee.amountSen : order.paySen) }}</text>
      <text class="muted" data-test="method">{{ payMethod ? PAYMENT_METHODS[payMethod] : '' }}</text>
    </view>
    <view v-if="isCard" class="card form" data-test="card-form">
      <text class="section">Card details</text>
      <text class="label">Card number</text>
      <input v-model="card.number" class="field" data-test="card-number" inputmode="numeric" placeholder="1234 5678 9012 3456" :maxlength="19">
      <text class="label">Name on card</text>
      <input v-model="card.name" class="field" data-test="card-name" placeholder="As shown on the card" :maxlength="60">
      <view class="pair">
        <view class="half">
          <text class="label">Expiry</text>
          <input v-model="card.expiry" class="field" data-test="card-expiry" inputmode="numeric" placeholder="MM/YY" :maxlength="5">
        </view>
        <view class="half">
          <text class="label">CVV</text>
          <input v-model="card.cvv" class="field" data-test="card-cvv" inputmode="numeric" password placeholder="123" :maxlength="3">
        </view>
      </view>
      <view v-if="problems.length" class="missing" data-test="card-missing">
        <text class="strong">To pay, please fill in:</text>
        <text v-for="p in problems" :key="p" data-test="card-hint">• {{ p }}</text>
      </view>
      <text class="muted" data-test="card-note">Test only: nothing is charged, and these details are never sent or saved. Try 4111 1111 1111 1111.</text>
    </view>
    <text class="muted center">The real payment page comes later. Pick what the bank should answer:</text>
    <button class="primary" data-test="outcome-success" :disabled="busy || !cardOk" @click="answer('success')">Pay (success)</button>
    <button class="ghost" data-test="outcome-failure" :disabled="busy || !cardOk" @click="answer('failure')">Fail</button>
    <button class="ghost" data-test="outcome-unknown" :disabled="busy || !cardOk" @click="answer('unknown')">Still checking</button>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { PAYMENT_METHODS, cardNumberText, expiryText, extraFeeTitle, formatRM, klDate, testCardProblems, type ExtraFee, type MockOutcome, type OrderView } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getExtraFees, getOrder, testOutcome } from '@/api/booking';

const order = ref<OrderView | null>(null);
const paymentId = ref(0);
const busy = ref(false);
const error = ref('');
/** R41-8: card details stay in this page only; they are never sent to the server. */
const card = reactive({ number: '', name: '', expiry: '', cvv: '' });
/** E11-3 (R47-2): paying an extra fee instead of the order. */
const fee = ref<ExtraFee | null>(null);
const payMethod = computed(() => (fee.value ? fee.value.payment?.method : order.value?.payment?.method) ?? null);
const isCard = computed(() => payMethod.value === 'card');
const problems = computed(() => (isCard.value ? testCardProblems(card, klDate(new Date())) : []));
const cardOk = computed(() => !problems.value.length);
watch(() => card.number, (v) => { const t = cardNumberText(String(v)); if (t !== v) card.number = t; });
watch(() => card.expiry, (v) => { const t = expiryText(String(v)); if (t !== v) card.expiry = t; });
watch(() => card.cvv, (v) => { const t = String(v).replace(/\D/g, '').slice(0, 3); if (t !== v) card.cvv = t; });

onLoad(async (q) => {
  if (!(await requireUser('/pages/booking/confirm'))) return;
  paymentId.value = Number(q?.payment);
  if (q?.fee) fee.value = (await getExtraFees(Number(q.order))).find((f) => f.id === Number(q.fee)) ?? null;
  order.value = await getOrder(Number(q?.order));
});

async function answer(outcome: MockOutcome) {
  error.value = '';
  busy.value = true;
  try {
    await testOutcome(paymentId.value, outcome);
    Object.assign(card, { number: '', name: '', expiry: '', cvv: '' });
    if (fee.value) uni.redirectTo({ url: `/pages/orders/extra?id=${order.value!.id}&fee=${fee.value.id}` });
    else uni.redirectTo({ url: `/pages/orders/result?id=${order.value!.id}` });
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
.form { align-items: stretch; gap: 8rpx; }
.section { font-weight: 700; font-size: 30rpx; }
.label { font-size: 24rpx; color: var(--pp-muted); margin-top: 8rpx; }
.field { height: 80rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; }
.pair { display: flex; gap: 20rpx; }
.half { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.missing { display: flex; flex-direction: column; gap: 4rpx; margin-top: 8rpx; padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); color: var(--pp-danger); font-size: 24rpx; }
.strong { font-weight: 600; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
</style>
