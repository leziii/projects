<template>
  <view class="review" data-test="review">
    <view class="top">
      <text class="stars" data-test="review-stars">{{ starsText(review.stars) }}</text>
      <text class="who" data-test="review-who">{{ review.ownerName }} · {{ monthText(review.createdAt) }}</text>
    </view>
    <text v-if="review.comment" class="comment" data-test="review-comment">{{ review.comment }}</text>
    <view v-if="review.reply" class="reply" data-test="review-reply">
      <text class="label">Caregiver's reply</text>
      <text>{{ review.reply }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { monthText, starsText, type Review } from '@pawpal/shared';

defineProps<{ review: Review }>();
</script>

<style>
.review { display: flex; flex-direction: column; gap: 8rpx; padding: 16rpx 0; border-bottom: 1px solid var(--pp-border); }
.review:last-child { border-bottom: none; }
.review .top { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; }
.review .stars { color: var(--pp-accent); font-size: 30rpx; letter-spacing: 2rpx; }
.review .who { font-size: 24rpx; color: var(--pp-muted); }
.review .comment { font-size: 28rpx; line-height: 1.5; }
.review .reply { display: flex; flex-direction: column; gap: 4rpx; margin-top: 4rpx; padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); font-size: 26rpx; }
.review .label { font-size: 24rpx; font-weight: 600; color: var(--pp-muted); }
</style>
