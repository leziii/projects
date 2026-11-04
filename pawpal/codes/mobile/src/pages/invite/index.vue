<template>
  <view v-if="info" class="content">
    <view class="card" data-test="invite-card">
      <text class="label">Your invite code</text>
      <text class="code" data-test="invite-code-mine">{{ info.code }}</text>
      <text class="sub">Friends sign up with your link or code. When their first booking is done, you both get {{ reward }} credit.</text>
      <button class="primary" data-test="copy-link" @click="copyLink">Copy link</button>
      <button class="ghost" data-test="share-whatsapp" @click="shareWhatsApp">Share on WhatsApp</button>
    </view>

    <view class="card">
      <view class="row"><text>Friends joined</text><text data-test="joined">{{ info.joined }}</text></view>
      <view class="row"><text>Rewards given</text><text data-test="rewarded">{{ info.rewarded }}</text></view>
      <view class="row"><text>My credit</text><text class="strong" data-test="credit">{{ creditText(info.credit) }}</text></view>
    </view>

    <text class="note" data-test="invite-rules">Only new accounts count. Credit is used by itself when you pay, lasts {{ REFERRAL_RULES.creditMonths }} months and cannot be cashed out. You always pay at least RM1.</text>
  </view>
  <view v-else class="content">
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { creditText, formatRM, inviteLink, inviteShareText, REFERRAL_RULES, type InviteInfo } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getInvite } from '@/api/invite';

const info = ref<InviteInfo | null>(null);
const error = ref('');
const reward = formatRM(REFERRAL_RULES.rewardSen);

const link = () => inviteLink(window.location.origin, info.value!.code);

function copyLink() {
  uni.setClipboardData({ data: link(), success: () => uni.showToast({ title: 'Link copied', icon: 'success' }) });
}

function shareWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(inviteShareText(info.value!.code, link()))}`, '_blank');
}

onShow(async () => {
  if (!(await requireUser('/pages/invite/index'))) return;
  try {
    info.value = await getInvite();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 24rpx; }
.card { padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.label { display: block; font-size: 26rpx; color: var(--pp-muted); }
.code { display: block; margin: 8rpx 0 12rpx; font-size: 56rpx; font-weight: 700; letter-spacing: 8rpx; color: var(--pp-primary-strong); }
.sub { display: block; font-size: 26rpx; margin-bottom: 20rpx; }
.row { display: flex; justify-content: space-between; padding: 14rpx 0; font-size: 28rpx; }
.strong { font-weight: 600; }
.primary { margin-top: 12rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.ghost { margin-top: 16rpx; color: var(--pp-primary-strong); background: var(--pp-surface); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
.note { font-size: 24rpx; color: var(--pp-muted); }
.error { color: var(--pp-danger); }
</style>
