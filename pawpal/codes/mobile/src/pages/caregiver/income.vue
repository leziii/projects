<template>
  <view v-if="income" class="content">
    <view class="card">
      <text class="section">Overview</text>
      <view class="totals">
        <view class="total" data-test="total-pending">
          <text class="note">Pending</text>
          <text class="amount" data-test="pending">{{ formatRM(income.pendingSen) }}</text>
        </view>
        <view class="total" data-test="total-frozen">
          <text class="note">Frozen (problem open)</text>
          <text class="amount" data-test="frozen">{{ formatRM(income.frozenSen) }}</text>
        </view>
        <view class="total" data-test="total-paying">
          <text class="note">Paying</text>
          <text class="amount" data-test="paying">{{ formatRM(income.payingSen) }}</text>
        </view>
        <view class="total" data-test="total-paid">
          <text class="note">Paid this month</text>
          <text class="amount ok" data-test="paid">{{ formatRM(income.paidMonthSen) }}</text>
        </view>
      </view>
      <text v-if="income.fixing" class="warn" data-test="fixing">A payout did not go through. We are fixing it; you don't need to do anything.</text>
    </view>

    <view class="card">
      <text class="section">Recent orders</text>
      <view v-for="o in income.orders" :key="o.orderId" class="order" :data-test="`income-${o.number}`" @click="open(o.orderId)">
        <view class="row">
          <text class="strong" data-test="income-number">{{ o.number }}</text>
          <text class="tag" :class="o.state" data-test="income-state">{{ INCOME_TAG[o.state] }}</text>
        </view>
        <view class="row">
          <text class="note" data-test="income-visits">{{ visitCountText(o.visits) }}</text>
          <text class="strong" data-test="income-amount">{{ formatRM(o.amountSen) }} ›</text>
        </view>
      </view>
      <text v-if="!income.orders.length" class="note" data-test="no-income">No orders yet. Accepted orders show here.</text>
    </view>

    <text class="note center" data-test="income-note">{{ INCOME_NOTE }}</text>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { INCOME_NOTE, INCOME_TAG, formatRM, visitCountText, type CaregiverIncome } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getIncome } from '@/api/requests';

/** E13-2 S15 (round 54): four totals kept apart and the latest orders. No withdraw button: payouts are automatic. */
const income = ref<CaregiverIncome | null>(null);
const error = ref('');

async function load() {
  try {
    income.value = await getIncome();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onShow(async () => {
  if (!(await requireUser('/pages/caregiver/income'))) return;
  await load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/** R54-3, R55-1: S16 */
const open = (id: number) => uni.navigateTo({ url: `/pages/caregiver/settlement?id=${id}` });
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.totals { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.total { display: flex; flex-direction: column; gap: 6rpx; padding: 20rpx; background: var(--pp-background); border-radius: 16rpx; }
.amount { font-weight: 700; font-size: 36rpx; }
.ok { color: var(--pp-primary-strong); }
.warn { font-size: 26rpx; color: var(--pp-danger); }
.order { display: flex; flex-direction: column; gap: 6rpx; padding: 14rpx 0; border-bottom: 1px solid var(--pp-border); }
.row { display: flex; justify-content: space-between; align-items: center; }
.strong { font-weight: 600; font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-ink); }
.tag.paid { color: var(--pp-primary-strong); }
.tag.frozen, .tag.failed { color: var(--pp-danger); }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
</style>
