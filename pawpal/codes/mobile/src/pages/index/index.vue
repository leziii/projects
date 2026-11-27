<template>
  <view class="content with-nav">
    <view class="brand" data-test="brand">
      <image class="logo" :src="logo" mode="aspectFit" />
      <view class="brand-text">
        <text class="title">{{ BRAND.name }}</text>
        <text class="sub">{{ BRAND.tagline }}</text>
      </view>
      <MessagesLink v-if="user" />
      <text class="account" data-test="account" @click="openAccount">{{ user ? 'Me' : 'Log in' }}</text>
    </view>

    <view class="hero">
      <view class="hero-text">
        <text class="hero-title">Away this weekend?</text>
        <text class="hero-sub">A checked carer comes to your home to feed and look after your cat or dog.</text>
      </view>
      <button class="hero-btn" data-test="book-now" @click="bookNow">Book a visit</button>
    </view>

    <view v-if="hint === 'prompt'" class="card install" data-test="install">
      <text class="card-title">Get the PawPal app</text>
      <text class="note">Add PawPal to your home screen for quick booking and alerts.</text>
      <button class="primary" data-test="install-button" @click="install">Install</button>
    </view>
    <view v-else-if="hint === 'ios'" class="card install" data-test="install">
      <text class="card-title">Get the PawPal app</text>
      <text class="note">Tap the Share button, then "Add to Home Screen".</text>
    </view>

    <view class="list">
      <view class="section-head">
        <text class="section-title">Prices per visit</text>
        <text v-if="user" class="orders-link" data-test="my-orders" @click="myOrders">My orders ›</text>
      </view>
      <view data-test="prices">
        <view v-for="(row, i) in prices" :key="row.service" class="svc">
          <view class="svc-icon"><PpIcon :name="SERVICE_ICONS[i] ?? 'paw'" :size="20" :weight="1.8" /></view>
          <view class="svc-text">
            <text class="svc-name">{{ row.service }}</text>
            <text v-if="row.minMinutes" class="muted">At least {{ row.minMinutes }} min</text>
          </view>
          <text class="price">{{ row.price }}</text>
        </view>
      </view>
      <text class="note">Max {{ DEFAULT_RULES.capacity.maxPets }} pets, max {{ DEFAULT_RULES.capacity.maxDogs }} dogs per booking.</text>
      <text class="note">Pets need a profile and health check.</text>
    </view>

    <text class="health">{{ healthLabel(health) }}</text>
    <BottomNav role="owner" active="home" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { currentRules } from '@/api/rules';
import { trackStep } from '@/api/funnel';
import { BRAND, DEFAULT_RULES, logoDataUrl, priceList, type HealthReport, type User } from '@pawpal/shared';
import { currentUser, loginUrl } from '@/api/auth';
import { fetchHealth, healthLabel } from '@/api/health';
import MessagesLink from '@/components/MessagesLink.vue';
import BottomNav from '@/components/BottomNav.vue';
import PpIcon from '@/components/PpIcon.vue';
import type { IconName } from '@pawpal/shared';
import { installHint, isStandalone, type InstallHint } from '@/install';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const logo = logoDataUrl();
/** One icon per price row, in priceList() order. */
const SERVICE_ICONS: IconName[] = ['cat', 'dog', 'star', 'paw', 'paw', 'plus', 'clock'];
const prices = ref(priceList());
const health = ref<HealthReport | null>(null);
const hint = ref<InstallHint>('none');
const user = ref<User | null>(null);
let promptEvent: InstallPromptEvent | null = null;

const ua = () => globalThis.navigator?.userAgent ?? '';
const onPrompt = (e: Event) => {
  e.preventDefault(); // show our own button instead of the browser's mini bar
  promptEvent = e as InstallPromptEvent;
  hint.value = installHint(ua(), isStandalone(), true);
};
const onInstalled = () => {
  hint.value = 'installed';
};

async function install() {
  await promptEvent?.prompt();
  promptEvent = null;
  hint.value = 'none';
}

onLoad(async () => {
  hint.value = installHint(ua(), isStandalone(), false);
  globalThis.addEventListener?.('beforeinstallprompt', onPrompt);
  globalThis.addEventListener?.('appinstalled', onInstalled);
  void trackStep('home');
  health.value = await fetchHealth();
});

onShow(async () => {
  user.value = await currentUser();
  prices.value = priceList(await currentRules());
});

/** R18-6: a guest logs in first, then lands on the booking setup. */
function bookNow() {
  uni.navigateTo({ url: user.value ? '/pages/booking/index' : loginUrl('/pages/booking/index') });
}

/** R30-1 */
function myOrders() {
  uni.navigateTo({ url: '/pages/orders/index' });
}

function openAccount() {
  uni.navigateTo({ url: user.value ? '/pages/me/index' : loginUrl('/pages/me/index') });
}

onUnload(() => {
  globalThis.removeEventListener?.('beforeinstallprompt', onPrompt);
  globalThis.removeEventListener?.('appinstalled', onInstalled);
});
</script>

<style>
.content { display: flex; flex-direction: column; gap: 24rpx; padding: 24rpx 32rpx; }
.brand { display: flex; align-items: center; gap: 16rpx; }
.logo { width: 64rpx; height: 64rpx; }
.brand-text { flex: 1; min-width: 0; }
.title { display: block; font-size: 32rpx; font-weight: 700; color: var(--pp-ink); }
.sub { display: block; color: var(--pp-muted); font-size: 22rpx; white-space: nowrap; }
.account { color: var(--pp-primary-strong); font-weight: 700; font-size: 28rpx; padding: 12rpx 0 12rpx 16rpx; }
.hero { display: flex; flex-direction: column; gap: 24rpx; padding: 32rpx; border-radius: var(--pp-radius-card); background: var(--pp-primary); color: var(--pp-ink); }
.hero-text { display: flex; flex-direction: column; gap: 8rpx; }
.hero-title { font-size: 40rpx; line-height: 1.25; font-weight: 700; }
.hero-sub { font-size: 26rpx; line-height: 1.45; }
.hero-btn { align-self: flex-start; margin: 0; padding: 0 36rpx; height: 84rpx; line-height: 84rpx; border-radius: var(--pp-radius-button); background: var(--pp-ink); color: var(--pp-surface); font-size: 28rpx; font-weight: 700; }
.list { display: flex; flex-direction: column; padding: 8rpx 32rpx 28rpx; border-radius: var(--pp-radius-card); background: var(--pp-surface); border: 1px solid var(--pp-border); }
.section-head { display: flex; justify-content: space-between; align-items: baseline; padding: 20rpx 0 12rpx; }
.section-title { font-size: 30rpx; font-weight: 700; }
.orders-link { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; }
.svc { display: flex; align-items: center; gap: 20rpx; padding: 20rpx 0; border-top: 1px solid var(--pp-border); }
.svc-icon { width: 72rpx; height: 72rpx; border-radius: 12rpx; display: flex; align-items: center; justify-content: center; background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.svc-text { display: flex; flex-direction: column; gap: 2rpx; flex: 1; min-width: 0; }
.svc-name { font-weight: 600; font-size: 28rpx; }
.price { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; text-align: right; max-width: 52%; }
.muted { color: var(--pp-muted); font-size: 22rpx; }
.card { padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card-title { display: block; font-weight: 700; margin-bottom: 12rpx; }
.note { display: block; font-size: 24rpx; color: var(--pp-muted); margin-top: 8rpx; }
.list .note:first-of-type { padding-top: 16rpx; border-top: 1px solid var(--pp-border); }
.primary { margin-top: 20rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.health { font-size: 22rpx; color: var(--pp-muted); text-align: center; }
</style>
