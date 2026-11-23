<template>
  <view v-if="s" class="content">
    <view class="card">
      <text class="section" data-test="settle-number">Order {{ s.number }}</text>
      <text class="status" :class="s.state" data-test="settle-status">{{ settlementStatusText(s) }}</text>
      <view class="row">
        <text class="note">{{ settledAlready ? 'Your income' : 'Expected income' }}</text>
        <text class="amount" data-test="settle-amount">{{ formatRM(s.amountSen) }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">Each part</text>
      <view v-for="(l, k) in s.lines" :key="k" class="line" :data-test="`line-${k}`">
        <view class="row">
          <text class="strong" data-test="line-label">{{ l.label }}<text v-if="l.problemOpen" class="warn" data-test="line-problem"> (problem open)</text></text>
          <text class="strong" data-test="line-amount">{{ formatRM(l.caregiverSen) }}</text>
        </view>
        <text class="note" data-test="line-math">{{ lineMath(l) }}</text>
      </view>
    </view>

    <view v-if="s.problems.length || s.refunds.length" class="card">
      <text class="section">Problems and refunds</text>
      <view v-for="(p, k) in s.problems" :key="`p${k}`" class="line" data-test="problem" @click="openProblem(p)">
        <view class="row">
          <text class="strong">Visit {{ p.index + 1 }} · {{ p.by === 'caregiver' ? 'You reported' : 'Owner raised' }}: {{ p.kind }}</text>
          <text v-if="p.by === 'caregiver'" class="link">›</text>
        </view>
        <text class="note" data-test="problem-status">{{ p.status }}</text>
      </view>
      <view v-for="r in s.refunds" :key="r.key" class="line" data-test="refund">
        <view class="row">
          <text class="strong">{{ r.reason }}</text>
          <text class="strong">{{ formatRM(r.amountSen) }}</text>
        </view>
        <text class="note" data-test="refund-state">Refunded to the owner{{ r.done ? '' : ' · on its way' }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">Payout</text>
      <view v-if="s.payout" class="row" data-test="payout">
        <text class="note" data-test="payout-state">{{ PAYOUT_STATE[s.payout.state] }} · {{ klAtText(s.payout.at) }}</text>
        <text class="strong" data-test="payout-amount">{{ formatRM(s.payout.amountSen) }}</text>
      </view>
      <text v-else class="note" data-test="payout-none">{{ s.state === 'nothing' ? 'Nothing to pay on this order.' : PAYOUT_PENDING_NOTE }}</text>
    </view>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { PAYOUT_PENDING_NOTE, formatRM, klAtText, lineMath, settlementStatusText, type OrderSettlement } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getSettlement } from '@/api/requests';

/** E13-3 S16 (round 55): one order's income, line by line, as settlement saved it. */
const s = ref<OrderSettlement | null>(null);
const error = ref('');
let id = 0;
const PAYOUT_STATE = { paying: 'Paying', paid: 'Paid', failed: 'Failed · we are fixing it' } as const;
const settledAlready = computed(() => !!s.value && !['pending', 'frozen'].includes(s.value.state));

async function load() {
  try {
    s.value = await getSettlement(id);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  if (!(await requireUser(`/pages/caregiver/settlement?id=${id}`))) return;
  await load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/** R55-4: the visit's problem page (the caregiver's own report). */
const openProblem = (p: OrderSettlement['problems'][number]) => {
  if (p.by === 'caregiver') uni.navigateTo({ url: `/pages/caregiver/problem?id=${id}&i=${p.index}` });
};
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.status { font-size: 28rpx; font-weight: 600; color: var(--pp-ink); }
.status.paid { color: var(--pp-primary-strong); }
.status.frozen, .status.failed { color: var(--pp-danger); }
.amount { font-weight: 700; font-size: 36rpx; }
.line { display: flex; flex-direction: column; gap: 4rpx; padding: 12rpx 0; border-bottom: 1px solid var(--pp-border); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.warn { color: var(--pp-danger); font-weight: 400; }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
</style>
