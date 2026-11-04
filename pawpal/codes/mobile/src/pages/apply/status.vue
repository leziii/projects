<template>
  <view v-if="app && user" class="content">
    <view class="card" data-test="status-card">
      <text class="title" data-test="app-status">{{ view.title }}</text>
      <text v-if="app.submittedAt" class="muted" data-test="sent">Sent {{ sentDate(app.submittedAt) }}</text>
      <text v-if="view.note" class="note">{{ view.note }}</text>
    </view>

    <view v-if="view.reason" class="card reason" data-test="reason">
      <text class="strong">What we need</text>
      <text data-test="admin-note">{{ view.reason }}</text>
    </view>

    <view class="card">
      <text class="strong">Your application</text>
      <text class="muted">{{ app.fullName }} · IC {{ maskIc(app.icNumber) }}</text>
      <text class="muted">{{ cares }} · {{ app.areas.join(', ') }}</text>
    </view>

    <template v-if="view.action === 'switch'">
      <view class="card" data-test="next-steps">
        <text class="strong">Next steps</text>
        <view v-for="s in NEXT_STEPS" :key="s.story" class="item" @click="soon(s.story)">
          <text>{{ s.label }}</text>
          <text class="soon">Coming soon</text>
        </view>
      </view>
      <text class="muted center">Until approval nobody can accept orders; now you can.</text>
      <button v-if="user.activeRole !== 'caregiver'" class="primary" data-test="switch-caregiver" :disabled="busy" @click="toCaregiver">Switch to Caregiver</button>
    </template>
    <button v-else-if="view.action === 'fix'" class="primary" data-test="fix" @click="fix">Fix my application</button>
    <text v-else class="muted center">You cannot accept orders until your application is approved.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { DOG_SIZE_LABEL, maskIc, type Application, type User } from '@pawpal/shared';
import { requireUser, roleHome, switchRole } from '@/api/auth';
import { getApplication } from '@/api/apply';
import { sentDate, statusView } from '@/apply';

const NEXT_STEPS = [
  { label: 'Set up your profile and services', story: 'E4-4' },
  { label: 'Set your schedule', story: 'E4-5' },
];

const user = ref<User | null>(null);
const app = ref<Application | null>(null);
const busy = ref(false);
const error = ref('');

const view = computed(() => statusView(app.value ?? { status: 'draft', adminNote: null }));
const cares = computed(() => {
  const a = app.value;
  if (!a) return '';
  return [a.cats ? 'Cats' : '', a.dogs ? `Dogs (${a.maxDogSize ? DOG_SIZE_LABEL[a.maxDogSize] : '—'})` : ''].filter(Boolean).join(', ');
});

/** Read fresh every time, so a decision shows as soon as the page is opened again. */
onShow(async () => {
  user.value = await requireUser('/pages/apply/status');
  if (!user.value) return;
  const a = await getApplication();
  // Not sent yet: the form is the page for that.
  if (a.status === 'draft') {
    uni.redirectTo({ url: '/pages/apply/index' });
    return;
  }
  app.value = a;
});

function fix() {
  uni.navigateTo({ url: '/pages/apply/index' });
}

function soon(story: string) {
  uni.showToast({ title: `Coming soon (${story})`, icon: 'none' });
}

async function toCaregiver() {
  error.value = '';
  busy.value = true;
  try {
    const updated = await switchRole('caregiver');
    uni.reLaunch({ url: roleHome(updated.activeRole) });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.reason { border-color: var(--pp-accent); }
.title { font-size: 40rpx; font-weight: 700; }
.strong { font-weight: 700; }
.note { font-size: 28rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.center { text-align: center; margin: 8rpx 0 16rpx; }
.item { display: flex; justify-content: space-between; padding: 16rpx 0; border-top: 1px solid var(--pp-border); }
.soon { color: var(--pp-muted); font-size: 24rpx; }
.error { display: block; margin-top: 16rpx; color: var(--pp-danger); font-size: 26rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
