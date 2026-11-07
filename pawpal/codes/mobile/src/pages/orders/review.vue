<template>
  <view v-if="order" class="content">
    <view class="card">
      <text class="section" data-test="review-for">Rate {{ order.caregiver.displayName }}</text>
      <text class="note">Order {{ order.number }} · {{ order.visits.length }} visit{{ order.visits.length === 1 ? '' : 's' }}</text>
      <view class="stars" data-test="stars">
        <text v-for="n in 5" :key="n" class="star" :class="{ on: n <= stars }" :data-test="`star-${n}`" @click="stars = n">{{ n <= stars ? '★' : '☆' }}</text>
      </view>
      <text class="note center" data-test="stars-label">{{ stars ? STAR_WORDS[stars - 1] : 'Tap a star' }}</text>
    </view>

    <view class="card">
      <text class="section">Comment (optional)</text>
      <textarea v-model="comment" class="box" data-test="comment" :maxlength="REVIEW_RULES.commentMax" placeholder="What went well? Anything to improve?" />
      <text class="note right" data-test="comment-count">{{ comment.length }} / {{ REVIEW_RULES.commentMax }}</text>
    </view>

    <text class="note">Other owners see your stars, comment, short name and month. You cannot change it after sending. It does not affect payment.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="primary" data-test="send-review" :disabled="busy || !!problem" @click="send">Send review</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { REVIEW_RULES, reviewProblem, type OrderDetail } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getOrderDetail, rateOrder } from '@/api/booking';

const STAR_WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const order = ref<OrderDetail | null>(null);
const stars = ref(0);
const comment = ref('');
const error = ref('');
const busy = ref(false);
const problem = computed(() => reviewProblem({ stars: stars.value, comment: comment.value }));
let id = 0;

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  if (!(await requireUser(`/pages/orders/review?id=${id}`))) return;
  try {
    order.value = await getOrderDetail(id);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function send() {
  error.value = '';
  busy.value = true;
  try {
    await rateOrder(id, stars.value, comment.value);
    uni.showToast({ title: 'Thank you!', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.right { text-align: right; }
.stars { display: flex; justify-content: center; gap: 24rpx; padding: 16rpx 0 0; }
.star { font-size: 72rpx; line-height: 1; color: var(--pp-border); }
.star.on { color: var(--pp-accent); }
.box { width: 100%; height: 220rpx; padding: 16rpx; box-sizing: border-box; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
