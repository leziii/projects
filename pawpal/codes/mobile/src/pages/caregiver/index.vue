<template>
  <view v-if="paused" class="content" data-test="paused">
    <view class="card">
      <text class="section">Your account is paused</text>
      <text class="note" data-test="paused-reason">{{ paused.reason ? `Reason: ${paused.reason}` : 'PawPal paused your caregiver account.' }}</text>
      <text class="note">You cannot see or accept requests while it is paused. Contact us if you think this is a mistake.</text>
      <HelpButton />
    </view>
    <button class="ghost" data-test="owner-home" @click="ownerHome">Go to owner home</button>
  </view>
  <view v-else-if="user" class="content">
    <view class="head">
      <text class="title">Caregiver dashboard</text>
      <view class="links">
        <MessagesLink />
        <text class="link" data-test="account" @click="openMe">Me</text>
      </view>
    </view>
    <view class="card" data-test="requests">
      <view class="row">
        <text class="section" data-test="requests-title">Waiting for you ({{ list?.open.length ?? 0 }})</text>
        <text class="link" data-test="see-all" @click="openAll">See all ›</text>
      </view>
      <view v-if="top" class="req" data-test="top-request" @click="openOne(top.orderId)">
        <view class="row">
          <text class="tag" :class="{ urgent: top.urgent }" data-test="top-tag">{{ tagText(top) }}</text>
          <text class="left" data-test="top-left">{{ leftText(top, now) }}</text>
        </view>
        <text class="line">{{ visitsText(top) }}</text>
        <text class="note">{{ whereText(top) }} · {{ incomeText(top) }}</text>
      </view>
      <text v-else class="note" data-test="no-requests">No requests right now. New ones also come as alerts.</text>
    </view>
    <view class="card" data-test="tasks-card" @click="openTasks">
      <view class="row">
        <text class="section">Today's tasks</text>
        <text class="link">My tasks ›</text>
      </view>
      <text class="note" data-test="today-count">{{ todayCount ? `${todayCount} ${todayCount === 1 ? 'visit' : 'visits'} today` : 'No visits today.' }}</text>
    </view>
    <AlertsCard :user-phone="user.phone" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { REQUEST_RULES, type RequestList, type User } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getHome, getPaused, getRequests } from '@/api/requests';
import AlertsCard from '@/components/AlertsCard.vue';
import HelpButton from '@/components/HelpButton.vue';
import MessagesLink from '@/components/MessagesLink.vue';
import { REQUESTS_URL, anyExpired, incomeText, leftText, requestUrl, tagText, visitsText, whereText } from '@/requests';

const user = ref<User | null>(null);
const paused = ref<{ reason: string | null } | null>(null);
const list = ref<RequestList | null>(null);
const now = ref(new Date());
const top = computed(() => list.value?.open[0] ?? null);
let timer: ReturnType<typeof setInterval> | undefined;

const todayCount = ref(0);

async function load() {
  todayCount.value = (await getHome()).todayVisits;
  list.value = await getRequests();
  now.value = new Date();
}

onShow(async () => {
  const u = await requireUser('/pages/caregiver/index');
  if (!u) return;
  // R25-8: a paused caregiver sees why, and nothing else.
  if (u.caregiverStatus === 'suspended') {
    const p = await getPaused();
    paused.value = { reason: p.reason };
    return;
  }
  // Applied but not approved (R14-4): the application status says why. Owners belong on the owner home.
  if (u.caregiverStatus === 'pending' || u.caregiverStatus === 'rejected') uni.reLaunch({ url: '/pages/apply/status' });
  else if (u.activeRole !== 'caregiver') uni.reLaunch({ url: '/pages/index/index' });
  else {
    user.value = u;
    await load();
    // R25-5: time left updates every minute; a request that runs out leaves the list.
    clearInterval(timer);
    timer = setInterval(() => {
      now.value = new Date();
      if (list.value && anyExpired(list.value.open, now.value)) void load();
    }, REQUEST_RULES.tickMs);
  }
});
onHide(() => clearInterval(timer));
onUnload(() => clearInterval(timer));

/** R33-1 */
function openTasks() {
  uni.navigateTo({ url: '/pages/caregiver/tasks' });
}

function openAll() {
  uni.navigateTo({ url: REQUESTS_URL });
}

function openOne(id: number) {
  uni.navigateTo({ url: requestUrl(id) });
}

function openMe() {
  uni.navigateTo({ url: '/pages/me/index' });
}

function ownerHome() {
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>

<style>
.content { padding: 32rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8rpx; }
.title { font-size: 44rpx; font-weight: 700; }
.links { display: flex; gap: 28rpx; }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.card { margin-top: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { display: block; font-weight: 600; }
.row { display: flex; justify-content: space-between; align-items: center; }
.req { margin-top: 20rpx; padding: 20rpx; border: 1px solid var(--pp-border); border-radius: 16rpx; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.tag.urgent { background: var(--pp-danger); color: var(--pp-surface); }
.left { font-weight: 600; font-size: 26rpx; }
.line { display: block; margin-top: 10rpx; font-size: 28rpx; }
.ghost { margin-top: 24rpx; color: var(--pp-primary-strong); background: var(--pp-surface); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
.note { display: block; font-size: 26rpx; color: var(--pp-muted); margin-top: 6rpx; }
</style>
