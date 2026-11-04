<template>
  <text class="messages-link" data-test="messages-link" @click="open">
    Messages<text v-if="badge" class="badge" data-test="unread">{{ badge }}</text>
  </text>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { unreadCount } from '@/api/messages';
import { badgeText } from '@/messages';

const unread = ref(0);
const badge = computed(() => badgeText(unread.value));

const refresh = async () => {
  unread.value = await unreadCount();
};
// Mounted covers a link that appears after the page is shown; onShow covers coming back to the page.
onMounted(refresh);
onShow(refresh);

function open() {
  uni.navigateTo({ url: '/pages/messages/index' });
}
</script>

<style>
.messages-link { color: var(--pp-primary-strong); font-weight: 600; }
.badge { display: inline-block; margin-left: 8rpx; min-width: 32rpx; padding: 0 10rpx; border-radius: 999rpx; background: var(--pp-danger); color: var(--pp-surface); font-size: 22rpx; text-align: center; line-height: 32rpx; }
</style>
