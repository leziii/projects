<template>
  <view class="content">
    <view v-if="opened" class="card" data-test="opened">
      <text class="time">{{ timeAgo(opened.message.createdAt) }}</text>
      <text class="title" data-test="title">{{ opened.message.title }}</text>
      <text class="body" data-test="body">{{ opened.message.body }}</text>
    </view>

    <view v-if="opened?.latest" class="card latest" :class="{ gone: opened.latest.gone }" data-test="latest">
      <text class="label">Latest status</text>
      <text class="summary" data-test="latest-summary">{{ opened.latest.summary }}</text>
      <text class="note">{{ opened.latest.gone ? 'The link no longer works, so this is the current state.' : 'Read just now. The message above may be older.' }}</text>
      <button v-if="linkPage(opened.latest)" class="primary" data-test="open-link" @click="openLink">Open</button>
    </view>

    <view v-if="needRole" class="card" data-test="need-role">
      <text class="title">This message is for the {{ ROLE_LABEL[needRole] }} role</text>
      <text class="body">Switch role to open it. Your orders stay the same.</text>
      <button class="primary" data-test="switch-and-view" @click="goSwitch">Switch to {{ ROLE_LABEL[needRole] }}</button>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { OpenedMessage, Role } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { ApiError } from '@/api/client';
import { openMessage } from '@/api/messages';
import { linkPage, messageUrl, switchUrl, timeAgo } from '@/messages';
import { ROLE_LABEL } from '@/roles';

const id = ref(0);
const opened = ref<OpenedMessage | null>(null);
const needRole = ref<Role | null>(null);
const error = ref('');

onLoad((query) => {
  id.value = Number(query?.id) || 0;
});

onShow(async () => {
  if (!(await requireUser(messageUrl(id.value)))) return;
  opened.value = null;
  needRole.value = null;
  error.value = '';
  try {
    opened.value = await openMessage(id.value);
  } catch (e) {
    const err = e as ApiError;
    if (err.code === 'ROLE_SWITCH_NEEDED') needRole.value = err.body.role as Role;
    else error.value = err.message;
  }
});

function openLink() {
  const url = linkPage(opened.value?.latest ?? null);
  if (url) uni.navigateTo({ url });
}

function goSwitch() {
  if (needRole.value) uni.navigateTo({ url: switchUrl(needRole.value, id.value) });
}
</script>

<style>
.content { padding: 32rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.time { display: block; font-size: 22rpx; color: var(--pp-muted); }
.title { display: block; font-size: 34rpx; font-weight: 700; margin: 6rpx 0; }
.body { display: block; font-size: 28rpx; color: var(--pp-muted); }
.latest { border-color: var(--pp-primary); }
.latest.gone { border-color: var(--pp-border); }
.label { display: block; font-size: 24rpx; color: var(--pp-muted); }
.summary { display: block; font-size: 36rpx; font-weight: 700; color: var(--pp-primary-strong); margin: 6rpx 0; }
.gone .summary { color: var(--pp-muted); }
.note { display: block; font-size: 24rpx; color: var(--pp-muted); }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.primary { margin-top: 24rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
