<template>
  <view v-if="user" class="content">
    <view class="card" data-test="me">
      <text class="label">Logged in as</text>
      <text class="phone" data-test="my-phone">{{ formatMyPhone(user.phone) }}</text>
      <view class="role-row" data-test="switch-role" @click="openRole">
        <text>Current role <text class="chip" data-test="current-role">{{ ROLE_LABEL[user.activeRole] }}</text></text>
        <text class="link">Switch role ›</text>
      </view>
      <view class="role-row">
        <text>Notifications</text>
        <MessagesLink />
      </view>
    </view>

    <view v-if="appRow" class="card app-row" data-test="me-application" @click="openApplication">
      <text>Caregiver application</text>
      <text class="chip" data-test="me-application-status">{{ appRow }} ›</text>
    </view>

    <view v-for="section in menu" :key="section.title" class="card" :data-test="`menu-${section.title.toLowerCase()}`">
      <text class="section">{{ section.title }}</text>
      <view v-for="item in section.items" :key="item.label" class="item" :data-test="`item-${item.story}`" @click="openItem(item)">
        <text>{{ item.label }}</text>
        <text v-if="item.url" class="link">›</text>
        <text v-else class="soon">Soon</text>
      </view>
      <HelpButton v-if="section.title === 'Other'" />
    </view>

    <button class="ghost" data-test="logout" @click="signOut">Log out</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatMyPhone, type User } from '@pawpal/shared';
import { logout, requireUser } from '@/api/auth';
import { getApplication } from '@/api/apply';
import { meApplicationRow } from '@/apply';
import HelpButton from '@/components/HelpButton.vue';
import MessagesLink from '@/components/MessagesLink.vue';
import { ROLE_LABEL, meMenu, type MeMenuItem } from '@/roles';

const user = ref<User | null>(null);
const appRow = ref<string | null>(null);
const menu = computed(() => (user.value ? meMenu(user.value.activeRole, user.value.caregiverStatus === 'approved') : []));

onShow(async () => {
  user.value = await requireUser('/pages/me/index');
  // Only people who sent an application and are not approved yet (R14-5).
  const s = user.value?.caregiverStatus;
  appRow.value = s === 'pending' || s === 'rejected' ? meApplicationRow(await getApplication()) : null;
});

function openApplication() {
  uni.navigateTo({ url: '/pages/apply/status' });
}

function openRole() {
  uni.navigateTo({ url: '/pages/role/index' });
}

function openItem(item: MeMenuItem) {
  if (item.url) uni.navigateTo({ url: item.url });
  else uni.showToast({ title: `Coming soon (${item.story})`, icon: 'none' });
}

async function signOut() {
  await logout();
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>

<style>
.content { padding: 32rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.app-row { display: flex; justify-content: space-between; align-items: center; }
.label { display: block; color: var(--pp-muted); font-size: 26rpx; }
.phone { display: block; margin-top: 8rpx; font-size: 40rpx; font-weight: 700; }
.role-row { display: flex; justify-content: space-between; align-items: center; margin-top: 24rpx; padding-top: 24rpx; border-top: 1px solid var(--pp-border); }
.chip { margin-left: 12rpx; padding: 4rpx 18rpx; border-radius: 999rpx; background: var(--pp-background); color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.section { display: block; font-weight: 600; margin-bottom: 8rpx; }
.item { display: flex; justify-content: space-between; padding: 18rpx 0; border-bottom: 1px dashed var(--pp-border); }
.soon { color: var(--pp-muted); font-size: 24rpx; }
.ghost { margin-top: 16rpx; color: var(--pp-danger); background: var(--pp-surface); border: 1px solid var(--pp-danger); border-radius: var(--pp-radius-button); }
</style>
