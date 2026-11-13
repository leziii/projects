<template>
  <view v-if="fee" class="content">
    <view class="card">
      <text class="section" data-test="fee-title">{{ extraFeeTitle(fee) }}</text>
      <text class="note">Order {{ fee.number }} · visit {{ fee.index + 1 }}, {{ visitWhen(fee.visit) }} · {{ fee.caregiver }}</text>
      <text class="strong" :class="fee.status === 'requested' ? 'wait' : fee.status === 'paid' || fee.status === 'not_needed' ? 'ok' : 'muted'" data-test="fee-status">{{ extraFeeStatusText(fee) }}</text>
      <text v-if="fee.status === 'requested' && fee.payment?.status === 'failed'" class="error left" data-test="fee-failed">Payment failed. Try again.</text>
      <text v-if="fee.used" class="line" data-test="fee-used">{{ extraFeeUsedText(fee.used) }}</text>
      <text v-if="fee.used && fee.used.refundSen" class="link" data-test="see-refunds" @click="openRefunds">See refunds ›</text>
    </view>

    <view v-if="fee.kind === 'overtime'" class="card" data-test="overtime-box">
      <text class="line">{{ fee.caregiver }} asks to stay {{ fee.units * OVERTIME_RULES.unitMin }} min longer.</text>
      <text class="note" data-test="fits">✓ Fits {{ fee.caregiver }}'s schedule (checked when asked).</text>
      <text class="note" data-test="until">{{ fee.status === 'paid' ? 'Paid: the visit can run until' : 'If you pay, the visit can run until' }} {{ overtimeUntilText(fee.visit, fee.units) }}.</text>
      <text class="note">Unpaid overtime is not done. Unused minutes are refunded.</text>
    </view>

    <view v-else class="card" data-test="waiting-box">
      <text class="line" data-test="waiting-now">{{ waitText }}</text>
      <text class="note">{{ WAITING_RULE_TEXT }} You prepay {{ formatRM(WAITING_RULES.maxSen) }}; what is not used comes back to you.</text>
    </view>

    <template v-if="fee.status === 'requested'">
      <view class="card">
        <text class="section">Pay with</text>
        <view v-for="m in PAY_METHODS" :key="m" class="option" :class="{ on: method === m }" :data-test="`pay-${m}`" @click="method = m">
          <text class="strong">{{ method === m ? '◉' : '○' }} {{ PAYMENT_METHODS[m] }}</text>
        </view>
      </view>
      <button class="primary" data-test="fee-pay" :disabled="busy" @click="pay">{{ fee.kind === 'overtime' ? `Approve and pay ${formatRM(fee.amountSen)}` : `Prepay ${formatRM(fee.amountSen)}` }}</button>
      <button v-if="fee.kind === 'overtime'" class="ghost" data-test="fee-decline" :disabled="busy" @click="decline">Decline</button>
      <button v-else-if="canLetIn" class="ghost" data-test="let-in" :disabled="busy" @click="letIn">Let {{ fee.caregiver }} in now</button>
      <text v-if="fee.kind === 'waiting' && fee.entryMethod === 'pre_authorised'" class="note center">When you are ready, tell {{ fee.caregiver }} to go in; waiting stops then.</text>
    </template>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="ghost" data-test="back-to-order" @click="back">Back to order</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
  OVERTIME_RULES,
  PAYMENT_METHODS,
  PAY_METHODS,
  WAITING_RULES,
  WAITING_RULE_TEXT,
  extraFeeStatusText,
  extraFeeTitle,
  extraFeeUsedText,
  formatRM,
  overtimeUntilText,
  visitWhen,
  waitingState,
  waitingText,
  type ExtraFee,
  type PaymentMethod,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { confirmEntry, declineExtraFee, getExtraFees, payExtraFee } from '@/api/booking';
import { confirmBox } from '@/order-actions';

/** E11-3 O19 (round 47): approve and pay, decline (overtime), or let the caregiver in (waiting). */
const fee = ref<ExtraFee | null>(null);
const method = ref<PaymentMethod>('tng');
const error = ref('');
const busy = ref(false);
const now = ref(new Date());
let id = 0;
let feeId = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const waitText = computed(() => {
  const f = fee.value;
  if (!f?.visit.arrivedAt) return '';
  return `${f.caregiver} is at the door. ${waitingText(waitingState(f.visit, now.value))}`;
});
const canLetIn = computed(() => fee.value?.entryMethod === 'live_confirm' && !!fee.value.visit.arrivedAt && !fee.value.visit.enteredAt);

async function load() {
  try {
    const all = await getExtraFees(id);
    fee.value = all.find((f) => f.id === feeId) ?? null;
    if (!fee.value) error.value = 'Request not found';
    if (fee.value?.payment?.method) method.value = fee.value.payment.method;
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  feeId = Number(q?.fee) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/orders/extra?id=${id}&fee=${feeId}`))) return;
  await load();
  clearInterval(timer);
  timer = setInterval(() => (now.value = new Date()), 10_000);
});
onHide(() => clearInterval(timer));
onUnload(() => clearInterval(timer));

async function run(step: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  try {
    await step();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
  await load();
}

/** R47-2, R47-3: same test payment page as a booking; it comes back here. */
const pay = () =>
  run(async () => {
    const { paymentId } = await payExtraFee(id, feeId, method.value);
    uni.redirectTo({ url: `/pages/pay/test?order=${id}&fee=${feeId}&payment=${paymentId}` });
  });

const decline = async () => {
  if (!(await confirmBox('Decline overtime', `${fee.value!.caregiver} will finish the booked service only.`))) return;
  await run(async () => {
    await declineExtraFee(id, feeId);
  });
};

/** R47-3: let in; free within the first 10 minutes. */
const letIn = () =>
  run(async () => {
    await confirmEntry(id, fee.value!.index);
  });

const openRefunds = () => uni.navigateTo({ url: `/pages/orders/refunds?id=${id}` });

const back = () => (getCurrentPages().length > 1 ? uni.navigateBack() : uni.redirectTo({ url: `/pages/orders/detail?id=${id}` }));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.ok { color: var(--pp-primary-strong); }
.wait { color: var(--pp-accent); }
.muted { color: var(--pp-muted); }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.error.left { text-align: left; }
.option { padding: 16rpx; border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.option.on { border: 2px solid var(--pp-primary-strong); }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
