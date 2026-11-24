<template>
  <view v-if="order" class="content">
    <view class="card head-card">
      <view class="row">
        <view class="copyable" data-test="copy-number" @click="copyText(order.number, 'Order number copied')">
          <text class="head-number" data-test="order-number">{{ order.number }}</text>
          <view class="copy-icon" aria-label="Copy" data-test="copy-icon"><view class="sheet back" /><view class="sheet front" /></view>
        </view>
        <text class="tag head-tag" :class="result.tone" data-test="order-tag">{{ orderTag(order) }}</text>
      </view>
      <view class="who">
        <text class="avatar">{{ initials(order.caregiver.displayName) }}</text>
        <text class="line" data-test="order-caregiver">Caregiver: {{ order.caregiver.displayName }}</text>
      </view>
      <text class="note" data-test="order-status">{{ result.body }}</text>
      <text v-if="order.substituteOf" class="note" data-test="substitute-of">Substitute for order {{ order.substituteOf.number }} · paid on that order</text>
    </view>

    <view v-if="order.substitute" class="card" data-test="substitute-card" @click="openSubstitute">
      <text class="section">A substitute caregiver for you to approve</text>
      <text class="line" data-test="substitute-summary">{{ order.substitute.caregiver.displayName }} can take {{ order.substitute.visits.length === 1 ? 'visit' : 'visits' }} {{ order.substitute.visits.map((v) => v.index + 1).join(', ') }}. Answer by {{ klAtText(order.substitute.answerBy) }}.</text>
      <text class="link" data-test="open-substitute">Review ›</text>
    </view>

    <view v-if="order.extraFees.length" class="card extra" data-test="extra-fees">
      <text class="section">Extra fee to approve</text>
      <view v-for="f in order.extraFees" :key="f.id" class="row" :data-test="`extra-${f.id}`" @click="openFee(f.id)">
        <text class="strong">Visit {{ f.index + 1 }} · {{ extraFeeTitle(f) }}</text>
        <text class="link">Open ›</text>
      </view>
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
        <text v-if="order.runs[i]?.cancel" class="note" data-test="visit-cancelled">{{ cancelledText(order.runs[i].cancel!) }}</text>
        <text v-if="order.runs[i]?.status === 'report_sent'" class="link" data-test="report-ready" @click.stop="openReport(i)">{{ reportReadyText(order.runs[i].reportedAt!, new Date()) }} ›</text>
        <button v-if="canConfirm(i)" class="primary small" data-test="confirm-entry" :disabled="busy" @click.stop="confirm(i)">
          Confirm {{ order.caregiver.displayName }} is in
        </button>
      </view>
      <text class="note" data-test="order-pets">For {{ order.pets.map((p) => p.name).join(', ') }}</text>
    </view>

    <view v-if="order.review.state === 'open'" class="card" data-test="rate-box">
      <text class="section">How was it?</text>
      <text class="note" data-test="rate-until">{{ rateUntilText(order.review.until!) }}</text>
      <button class="primary small" data-test="rate" @click="rate">Rate {{ order.caregiver.displayName }}</button>
    </view>
    <view v-else-if="order.review.mine" class="card" data-test="my-review">
      <text class="section">Your review</text>
      <ReviewItem :review="order.review.mine" />
    </view>

    <view class="card">
      <text class="section">Payment</text>
      <view class="row"><text class="note">Price</text><text data-test="order-total">{{ formatRM(order.totalSen) }}</text></view>
      <view v-if="order.discountSen" class="row"><text class="note">Promo {{ order.promoCode }}</text><text data-test="order-discount">−{{ formatRM(order.discountSen) }}</text></view>
      <view v-if="order.creditSen" class="row"><text class="note">Credit</text><text data-test="order-credit">−{{ formatRM(order.creditSen) }}</text></view>
      <view class="row"><text class="strong">Paid</text><text class="strong" data-test="order-paid">{{ formatRM(order.paySen) }}</text></view>
    </view>
    <view v-if="refund" class="card" data-test="refund">
      <view class="row">
        <text class="section">Refund</text>
        <text class="link" data-test="refund-details" @click="openRefunds">Details ›</text>
      </view>
      <text :class="refundDone ? 'ok' : 'wait'" data-test="refund-line">{{ refund }}</text>
    </view>

    <view class="card">
      <text class="section">Where and getting in</text>
      <text v-if="order.address" class="line" data-test="order-address">{{ order.address.unit }}, {{ order.address.street }}, {{ order.address.postcode }} {{ order.address.area }}</text>
      <text class="line" data-test="order-entry">{{ ENTRY_METHOD_LABEL[order.entryMethod].title }}</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button v-if="canRebook(order)" class="primary" data-test="rebook" :disabled="busy" @click="rebook">Book again</button>
    <button v-if="anyCancellable" class="danger-ghost" data-test="cancel-visits" @click="openCancel">Cancel visits</button>
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
import { extraFeeTitle, ENTRY_METHOD_LABEL, REQUEST_RULES, canCancelVisit, canRebook, cancelledText, formatRM, klAtText, orderTag, payResult, rateUntilText, refundLine, reportReadyText, visitStatus, visitWhen, type OrderDetail } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { confirmEntry, getOrderDetail } from '@/api/booking';
import HelpButton from '@/components/HelpButton.vue';
import ReviewItem from '@/components/ReviewItem.vue';
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

/** R35-4 (KF hand test): the caregiver is at the door; confirm right here as well as on O14. */
const canConfirm = (i: number) => order.value?.status === 'accepted' && order.value.entryMethod === 'live_confirm' && order.value.runs[i]?.status === 'arrived';

async function confirm(i: number) {
  error.value = '';
  busy.value = true;
  try {
    order.value = await confirmEntry(id, i);
  } catch (e) {
    error.value = (e as Error).message;
    await load();
  } finally {
    busy.value = false;
  }
}

/** R32-1 */
/** R39-1: straight to the report. */
const openReport = (i: number) => uni.navigateTo({ url: `/pages/orders/report?id=${id}&i=${i}` });

/** R42-2 O15 */
const anyCancellable = computed(() => !!order.value && order.value.visits.some((v, i) => canCancelVisit(order.value!.status, order.value!.runs[i], v, now.value)));
const openFee = (feeId: number) => uni.navigateTo({ url: `/pages/orders/extra?id=${id}&fee=${feeId}` });
const openRefunds = () => uni.navigateTo({ url: `/pages/orders/refunds?id=${id}` });
/** E12-4 O20 (R52-3) */
const openSubstitute = () => uni.navigateTo({ url: `/pages/orders/substitute?id=${id}` });
const openCancel = () => uni.navigateTo({ url: `/pages/orders/cancel?id=${id}` });

/** R41-1 O21 */
const rate = () => uni.navigateTo({ url: `/pages/orders/review?id=${id}` });

function openVisit(i: number) {
  uni.navigateTo({ url: `/pages/orders/visit?id=${id}&i=${i}` });
}

async function rebook() {
  error.value = '';
  busy.value = true;
  error.value = (await rebookWithConfirm(id)) ?? '';
  busy.value = false;
}

/** "Lim M." → "LM" for the round avatar. */
const initials = (name: string) => name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 24rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; }
.copyable { display: flex; gap: 16rpx; align-items: center; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 700; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.head-card { background: var(--pp-ink); color: var(--pp-surface); gap: 20rpx; }
.head-card .note { color: var(--pp-primary-soft); }
.head-card .copy-icon .sheet { border-color: var(--pp-primary); background: var(--pp-ink); }
.head-number { font-size: 26rpx; color: var(--pp-primary-soft); }
.head-card .head-tag { background: var(--pp-primary); color: var(--pp-ink); }
.head-card .head-tag.bad { background: var(--pp-danger); color: var(--pp-surface); }
.who { display: flex; align-items: center; gap: 20rpx; }
.who .line { font-size: 32rpx; font-weight: 700; }
.avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: var(--pp-primary); color: var(--pp-ink); font-weight: 800; font-size: 32rpx; display: flex; align-items: center; justify-content: center; }
.visit { display: flex; flex-direction: column; gap: 6rpx; padding: 20rpx 0; border-top: 1px solid var(--pp-border); }
.tag { padding: 6rpx 20rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 700; white-space: nowrap; }
.tag.ok { background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.tag.wait { background: color-mix(in srgb, var(--pp-info) 12%, var(--pp-surface)); color: var(--pp-info); }
.tag.bad { background: color-mix(in srgb, var(--pp-danger) 13%, var(--pp-surface)); color: var(--pp-danger); }
.ok { color: var(--pp-success); }
.wait { color: var(--pp-ink); }
.bad { color: var(--pp-danger); }
.link { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 700; }
.primary.small { margin-top: 12rpx; font-size: 28rpx; min-height: 80rpx; line-height: 80rpx; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
uni-page-body .extra { border: 3rpx solid var(--pp-accent); }
.danger-ghost { width: 100%; background: var(--pp-surface); color: var(--pp-danger); border: 3rpx solid var(--pp-danger); border-radius: var(--pp-radius-button); font-weight: 700; }
</style>
