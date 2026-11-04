<template>
  <view v-if="user" class="content">
    <view class="tabs">
      <text v-for="t in MESSAGE_TABS" :key="t.key" class="tab" :class="{ on: tab === t.key }" :data-test="`tab-${t.key || 'all'}`" @click="pick(t.key)">
        {{ t.label }}
      </text>
    </view>

    <view class="tools">
      <text class="muted">{{ unread ? `${unread} unread` : 'All read' }}</text>
      <text v-if="unread" class="link" data-test="read-all" @click="markAll">Mark all read</text>
    </view>

    <view v-for="m in items" :key="m.id" class="card" :class="{ unread: !m.readAt }" data-test="message" @click="open(m)">
      <view class="top">
        <text v-if="!m.readAt" class="dot" data-test="unread-dot" />
        <text v-if="m.role" class="tag" data-test="role-tag">{{ roleTag(m.role) }}</text>
        <text class="title">{{ m.title }}</text>
        <text class="time">{{ timeAgo(m.createdAt) }}</text>
      </view>
      <text class="body">{{ m.body }}</text>
      <text class="link" data-test="action">{{ actionLabel(user, m) }}</text>
    </view>

    <text v-if="loaded && !items.length" class="empty" data-test="empty">No messages yet.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <text class="note">Messages are reminders only. Opening one always shows the latest status.</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { Message, MessageCategory, User } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { listMessages, readAllMessages } from '@/api/messages';
import { MESSAGE_TABS, actionLabel, messageUrl, roleTag, timeAgo } from '@/messages';

const user = ref<User | null>(null);
const tab = ref<MessageCategory | ''>('');
const items = ref<Message[]>([]);
const unread = ref(0);
const loaded = ref(false);
const error = ref('');

onShow(async () => {
  user.value = await requireUser('/pages/messages/index');
  if (user.value) await load();
});

async function load() {
  error.value = '';
  try {
    const list = await listMessages(tab.value);
    items.value = list.items;
    unread.value = list.unread;
  } catch (e) {
    error.value = (e as Error).message;
  }
  loaded.value = true;
}

function pick(key: MessageCategory | '') {
  tab.value = key;
  void load();
}

async function markAll() {
  await readAllMessages();
  await load();
}

function open(m: Message) {
  uni.navigateTo({ url: messageUrl(m.id) });
}
</script>

<style>
.content { padding: 32rpx; }
.tabs { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.tab { padding: 10rpx 28rpx; border-radius: 999rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); color: var(--pp-muted); font-size: 26rpx; }
.tab.on { background: var(--pp-primary-strong); border-color: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.tools { display: flex; justify-content: space-between; margin: 8rpx 0 16rpx; font-size: 26rpx; }
.muted { color: var(--pp-muted); }
.card { margin-bottom: 20rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card.unread { border-color: var(--pp-primary); }
.top { display: flex; align-items: center; gap: 12rpx; }
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: var(--pp-danger); flex: none; }
.tag { font-size: 22rpx; padding: 2rpx 14rpx; border-radius: 999rpx; background: var(--pp-background); color: var(--pp-primary-strong); font-weight: 600; flex: none; }
.title { flex: 1; font-weight: 600; }
.time { font-size: 22rpx; color: var(--pp-muted); flex: none; }
.body { display: block; margin: 10rpx 0; font-size: 26rpx; color: var(--pp-muted); }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.empty { display: block; text-align: center; color: var(--pp-muted); margin: 48rpx 0; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.note { display: block; margin-top: 24rpx; font-size: 24rpx; color: var(--pp-muted); }
</style>
