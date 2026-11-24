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
      <view class="hero-paw"><PpIcon name="paw" :size="150" :weight="1.4" /></view>
      <text class="hero-kicker">Home visits · cats and dogs</text>
      <text class="hero-title">Checked carers visit your pets at home</text>
      <button class="hero-btn" data-test="book-now" @click="bookNow">Book a visit <PpIcon name="arrow" :size="18" :weight="2.4" /></button>
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

    <view class="section-head">
      <text class="section-title">Services & prices</text>
      <text v-if="user" class="orders-link" data-test="my-orders" @click="myOrders">My orders ›</text>
    </view>
    <view class="services" data-test="prices">
      <view v-for="(row, i) in prices" :key="row.service" class="svc" :class="{ wide: i >= 3 }">
        <view class="svc-icon"><PpIcon :name="SERVICE_ICONS[i] ?? 'paw'" /></view>
        <view class="svc-text">
          <text class="svc-name">{{ row.service }}</text>
          <text class="price">{{ row.price }}<text v-if="row.minMinutes" class="muted"> · ≥{{ row.minMinutes }} min</text></text>
        </view>
      </view>
    </view>

    <view class="trust">
      <PpIcon name="shield" :size="22" />
      <view class="trust-text">
        <text class="note">Max {{ DEFAULT_RULES.capacity.maxPets }} pets, max {{ DEFAULT_RULES.capacity.maxDogs }} dogs per booking.</text>
        <text class="note">Pets need a profile and health check.</text>
      </view>
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
.content { display: flex; flex-direction: column; gap: 32rpx; padding: 40rpx 32rpx; }
.brand { display: flex; align-items: center; gap: 20rpx; }
.logo { width: 88rpx; height: 88rpx; }
.brand-text { flex: 1; min-width: 0; }
.title { display: block; font-size: 40rpx; font-weight: 800; color: var(--pp-ink); }
.sub { display: block; color: var(--pp-muted); font-size: 22rpx; white-space: nowrap; }
.account { color: var(--pp-primary-strong); font-weight: 700; font-size: 28rpx; padding: 12rpx 0 12rpx 16rpx; }
.hero { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 20rpx; padding: 44rpx; border-radius: 48rpx; background: var(--pp-primary); color: var(--pp-ink); }
.hero-paw { position: absolute; right: -40rpx; bottom: -50rpx; opacity: 0.22; color: var(--pp-primary-strong); }
.hero-kicker { font-size: 22rpx; font-weight: 700; letter-spacing: 2rpx; text-transform: uppercase; }
.hero-title { max-width: 520rpx; font-size: 46rpx; line-height: 1.2; font-weight: 800; }
.hero-btn { align-self: flex-start; display: flex; align-items: center; gap: 12rpx; margin: 8rpx 0 0; padding: 0 44rpx; height: 96rpx; border-radius: 999rpx; background: var(--pp-ink); color: var(--pp-surface); font-size: 30rpx; font-weight: 700; }
.section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: -12rpx; }
.section-title { font-size: 34rpx; font-weight: 700; }
.orders-link { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; }
.services { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20rpx; }
.svc { display: flex; flex-direction: column; gap: 16rpx; padding: 24rpx; border-radius: 36rpx; background: var(--pp-surface); box-shadow: var(--pp-shadow); }
.svc.wide { grid-column: span 3; flex-direction: row; align-items: center; padding: 20rpx 24rpx; }
.svc-icon { width: 76rpx; height: 76rpx; border-radius: 22rpx; display: flex; align-items: center; justify-content: center; background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.svc-text { display: flex; flex-direction: column; gap: 4rpx; flex: 1; }
.svc.wide .svc-text { flex-direction: row; justify-content: space-between; align-items: center; gap: 16rpx; }
.svc-name { font-weight: 700; font-size: 28rpx; }
.price { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; }
.svc.wide .price { text-align: right; max-width: 62%; }
.muted { color: var(--pp-muted); font-weight: 400; }
.svc:not(.wide) .muted { display: block; font-size: 22rpx; }
.card { padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card-title { display: block; font-weight: 700; margin-bottom: 12rpx; }
.note { display: block; font-size: 26rpx; color: var(--pp-muted); margin-top: 6rpx; }
.trust { display: flex; gap: 20rpx; align-items: flex-start; padding: 24rpx 28rpx; border-radius: 32rpx; background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.trust .note { color: var(--pp-ink); margin-top: 0; }
.primary { margin-top: 20rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.health { font-size: 24rpx; color: var(--pp-muted); text-align: center; }
</style>
