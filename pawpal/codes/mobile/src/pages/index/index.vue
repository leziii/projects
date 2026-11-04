<template>
  <view class="content">
    <view class="brand" data-test="brand">
      <image class="logo" :src="logo" mode="aspectFit" />
      <view class="brand-text">
        <text class="title">{{ BRAND.name }}</text>
        <text class="sub">{{ BRAND.tagline }}</text>
      </view>
      <MessagesLink v-if="user" />
      <text class="account" data-test="account" @click="openAccount">{{ user ? 'Me' : 'Log in' }}</text>
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

    <view class="card" data-test="prices">
      <text class="card-title">Services & prices</text>
      <view v-for="row in prices" :key="row.service" class="row">
        <text>{{ row.service }}</text>
        <text class="price">{{ row.price }}<text v-if="row.minMinutes" class="muted"> · ≥{{ row.minMinutes }} min</text></text>
      </view>
    </view>

    <button class="primary" data-test="book-now" @click="bookNow">Book now</button>
    <text v-if="user" class="orders-link" data-test="my-orders" @click="myOrders">My orders ›</text>

    <view class="card">
      <text class="card-title">Before you book</text>
      <text class="note">Max {{ DEFAULT_RULES.capacity.maxPets }} pets, max {{ DEFAULT_RULES.capacity.maxDogs }} dogs per booking.</text>
      <text class="note">Pets need a profile and health check.</text>
    </view>

    <text class="health">{{ healthLabel(health) }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { BRAND, DEFAULT_RULES, logoDataUrl, priceList, type HealthReport, type User } from '@pawpal/shared';
import { currentUser, loginUrl } from '@/api/auth';
import { fetchHealth, healthLabel } from '@/api/health';
import MessagesLink from '@/components/MessagesLink.vue';
import { installHint, isStandalone, type InstallHint } from '@/install';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const logo = logoDataUrl();
const prices = priceList();
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
  health.value = await fetchHealth();
});

onShow(async () => {
  user.value = await currentUser();
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
.orders-link { align-self: center; color: var(--pp-primary-strong); font-weight: 600; font-size: 28rpx; }
.content { display: flex; flex-direction: column; padding: 48rpx 32rpx; }
.brand { display: flex; align-items: center; gap: 24rpx; margin-bottom: 8rpx; }
.logo { width: 112rpx; height: 112rpx; }
.brand-text { flex: 1; }
.account { color: var(--pp-primary-strong); font-weight: 600; font-size: 28rpx; padding: 12rpx 0 12rpx 16rpx; }
.title { display: block; font-size: 52rpx; font-weight: 700; color: var(--pp-ink); }
.sub { display: block; color: var(--pp-muted); font-size: 26rpx; }
.card {
  margin-top: 28rpx;
  padding: 28rpx;
  background: var(--pp-surface);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius-card);
}
.card-title { display: block; font-weight: 600; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; padding: 10rpx 0; border-bottom: 1px dashed var(--pp-border); font-size: 28rpx; }
.price { color: var(--pp-primary-strong); font-weight: 600; text-align: right; max-width: 62%; }
.muted { color: var(--pp-muted); font-weight: 400; }
.note { display: block; font-size: 26rpx; color: var(--pp-muted); margin-top: 6rpx; }
.primary {
  margin-top: 20rpx;
  background: var(--pp-primary-strong);
  color: var(--pp-surface);
  border-radius: var(--pp-radius-button);
  font-weight: 600;
}
.health { margin-top: 40rpx; font-size: 24rpx; color: var(--pp-muted); text-align: center; }
</style>
