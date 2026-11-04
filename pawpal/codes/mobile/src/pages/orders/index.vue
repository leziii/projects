<template>
  <view class="content">
    <view class="filters">
      <text v-for="f in ORDER_FILTERS" :key="f.value" class="chip" :class="{ on: filter === f.value }" :data-test="`filter-${f.value}`" @click="choose(f.value)">{{ f.label }}</text>
    </view>

    <view v-if="failed" class="empty" data-test="load-error">
      <text class="error">Could not load your orders</text>
      <button class="primary" data-test="retry" @click="reload">Retry</button>
    </view>
    <template v-else-if="rows">
      <view v-for="o in rows" :key="o.id" class="card" data-test="order" @click="open(o.id)">
        <view class="row">
          <text class="strong" data-test="order-number">{{ o.number }} · {{ o.visits }} {{ o.visits === 1 ? 'visit' : 'visits' }}</text>
          <text class="tag" :class="tone(o)" data-test="order-tag">{{ orderTag(o) }}</text>
        </view>
        <text class="note" data-test="order-line">{{ orderLine(o, now) }}</text>
        <view class="row">
          <text class="note">Paid <text data-test="order-paid">{{ formatRM(o.paySen) }}</text></text>
          <text class="link">Details ›</text>
        </view>
      </view>
      <view v-if="!rows.length" class="empty" data-test="no-orders">
        <text class="note">No orders yet</text>
        <button class="primary" data-test="book-now" @click="book">Book now</button>
      </view>
      <text v-if="loadingMore" class="note center">Loading…</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { ORDER_FILTERS, formatRM, orderLine, orderTag, type OrderFilter, type OrderListRow } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrders } from '@/api/booking';

const filter = ref<OrderFilter>('all');
const rows = ref<OrderListRow[] | null>(null);
const failed = ref(false);
const loadingMore = ref(false);
const now = ref(new Date());
let next: number | null = null;

/** R30-5: first 20 again (filter change, pull down, coming back). */
async function reload() {
  failed.value = false;
  try {
    const page = await getOrders(filter.value);
    rows.value = page.rows;
    next = page.next;
    now.value = new Date();
  } catch {
    // R30-6
    failed.value = true;
  }
}

onShow(async () => {
  if (!(await requireUser('/pages/orders/index'))) return;
  await reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
/** R30-5: the next 20 when the owner scrolls to the end. */
onReachBottom(async () => {
  if (next === null || loadingMore.value || !rows.value) return;
  loadingMore.value = true;
  try {
    const page = await getOrders(filter.value, next);
    rows.value = [...rows.value, ...page.rows];
    next = page.next;
  } catch {
    uni.showToast({ title: 'Could not load more', icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
});

function choose(f: OrderFilter) {
  if (filter.value === f) return;
  filter.value = f;
  rows.value = null;
  void reload();
}

const tone = (o: OrderListRow) => (o.status === 'accepted' ? 'ok' : o.status === 'pending_accept' ? 'wait' : 'bad');

/** R31-1: a card opens the order details (O13). */
function open(id: number) {
  uni.navigateTo({ url: `/pages/orders/detail?id=${id}` });
}

function book() {
  uni.navigateTo({ url: '/pages/booking/index' });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.filters { display: flex; gap: 16rpx; flex-wrap: wrap; }
.chip { padding: 10rpx 28rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; font-size: 26rpx; background: var(--pp-surface); }
.chip.on { background: var(--pp-primary-strong); color: var(--pp-surface); border-color: var(--pp-primary-strong); }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; }
.strong { font-weight: 600; font-size: 28rpx; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); }
.tag.ok { color: var(--pp-primary-strong); }
.tag.wait { color: var(--pp-ink); }
.tag.bad { color: var(--pp-danger); }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 24rpx; padding: 64rpx 0; }
.error { color: var(--pp-danger); }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
