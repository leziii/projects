<template>
  <view v-if="user" class="content">
    <text class="title">Choose your role</text>

    <view class="option" :class="{ on: picked === 'owner' }" data-test="pick-owner" @click="picked = 'owner'">
      <view class="radio">{{ picked === 'owner' ? '●' : '' }}</view>
      <view class="text">
        <text class="name">Owner</text>
        <text class="desc">Book visits for your pets</text>
      </view>
      <text v-if="user.activeRole === 'owner'" class="tag">Current</text>
    </view>

    <view
      class="option"
      :class="{ on: picked === 'caregiver', off: !caregiver.enabled }"
      data-test="pick-caregiver"
      :aria-disabled="!caregiver.enabled"
      @click="caregiver.enabled && (picked = 'caregiver')"
    >
      <view class="radio">{{ picked === 'caregiver' ? '●' : '' }}</view>
      <view class="text">
        <text class="name">Caregiver</text>
        <text class="desc">Accept visits and care for pets</text>
      </view>
      <text class="tag" data-test="caregiver-tag">{{ user.activeRole === 'caregiver' ? 'Current' : caregiver.tag }}</text>
    </view>

    <text v-if="pausedReason !== null" class="paused" data-test="paused-reason">Your caregiver account is paused{{ pausedReason ? `: ${pausedReason}` : '.' }}</text>
    <text v-if="caregiver.apply" class="apply" data-test="apply" @click="apply">Not a caregiver yet? Apply to become a caregiver ›</text>
    <text v-else-if="user.caregiverStatus === 'pending'" class="apply" data-test="view-application" @click="apply">View my application ›</text>

    <text class="note">Switching role does not change who owns your orders, and you can never accept your own order.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>

    <button class="primary" data-test="switch" :disabled="picked === user.activeRole || busy" @click="confirm">
      Switch to {{ ROLE_LABEL[picked] }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { safeRedirect, type Role, type User } from '@pawpal/shared';
import { requireUser, roleHome, switchRole } from '@/api/auth';
import { getPaused } from '@/api/requests';
import { ROLE_LABEL, caregiverOption } from '@/roles';

const user = ref<User | null>(null);
const picked = ref<Role>('owner');
const busy = ref(false);
const error = ref('');
/** R25-8: why the caregiver account is paused; null when it is not. */
const pausedReason = ref<string | null>(null);
const caregiver = computed(() => caregiverOption(user.value?.caregiverStatus ?? 'none'));
/** From a message (C02): the role it needs, and where to go back after switching. */
let wanted: Role | null = null;
let redirect = '';

onLoad((query) => {
  wanted = query?.role === 'owner' || query?.role === 'caregiver' ? query.role : null;
  redirect = query?.redirect ? safeRedirect(query.redirect, '') : '';
});

onShow(async () => {
  user.value = await requireUser('/pages/role/index');
  if (!user.value) return;
  if (user.value.caregiverStatus === 'suspended') pausedReason.value = (await getPaused()).reason ?? '';
  picked.value = wanted === 'owner' || (wanted === 'caregiver' && caregiver.value.enabled) ? wanted : user.value.activeRole;
});

async function confirm() {
  error.value = '';
  busy.value = true;
  try {
    const updated = await switchRole(picked.value);
    uni.reLaunch({ url: redirect || roleHome(updated.activeRole) });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** The status page sends a not-yet-sent application on to the form. */
function apply() {
  uni.navigateTo({ url: '/pages/apply/status' });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; }
.title { font-size: 40rpx; font-weight: 700; margin-bottom: 24rpx; }
.option { display: flex; align-items: center; gap: 20rpx; padding: 28rpx; margin-bottom: 20rpx; background: var(--pp-surface); border: 2px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.option.on { border-color: var(--pp-primary-strong); }
.option.off { opacity: 0.55; }
.paused { display: block; margin-top: 16rpx; font-size: 26rpx; color: var(--pp-danger); }
.radio { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--pp-primary-strong); font-size: 24rpx; flex: none; }
.text { flex: 1; }
.name { display: block; font-weight: 600; }
.desc { display: block; font-size: 24rpx; color: var(--pp-muted); }
.tag { font-size: 24rpx; color: var(--pp-primary-strong); background: var(--pp-background); padding: 4rpx 16rpx; border-radius: 999rpx; }
.apply { color: var(--pp-primary-strong); font-weight: 600; margin: 8rpx 0 16rpx; }
.note { font-size: 24rpx; color: var(--pp-muted); margin-top: 12rpx; }
.error { display: block; margin-top: 16rpx; color: var(--pp-danger); font-size: 26rpx; }
.primary { margin-top: 32rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
