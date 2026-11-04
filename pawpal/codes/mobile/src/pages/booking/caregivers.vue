<template>
  <view class="content">
    <text v-if="note" class="note" data-test="free-note">{{ note }}</text>
    <view v-for="o in options" :key="o.card.id" class="card" :class="{ off: !o.free }" :data-test="`option-${o.card.id}`" @click="open(o.card.id)">
      <view class="head">
        <view class="avatar"><text>{{ o.card.initials }}</text></view>
        <view class="who">
          <text class="name">{{ o.card.displayName }}</text>
          <text class="muted">{{ cardRows(o.card)[0].value }} · {{ cardRows(o.card)[1].value }}</text>
        </view>
        <text class="more">›</text>
      </view>
      <view v-if="badges(o.card).length" class="badges">
        <text v-for="b in badges(o.card)" :key="b.key" class="badge">✓ {{ b.label }}</text>
      </view>
      <text class="availability" :class="{ clash: !o.free }" data-test="availability">{{ o.availability }}</text>
    </view>

    <view v-if="loaded && !options.length" class="card empty" data-test="no-match">
      <text class="strong">No caregiver fits this booking yet</text>
      <text class="muted">Try other dates or times, fewer pets or less overtime. Your booking is kept. PawPal never picks a caregiver for you.</text>
    </view>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button v-if="loaded" class="ghost" data-test="change-booking" @click="back">Change my booking</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { CaregiverOption } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { listCaregivers } from '@/api/booking';
import { badges, cardRows } from '@/trust';

const options = ref<CaregiverOption[]>([]);
const note = ref('');
const error = ref('');
const loaded = ref(false);

onShow(async () => {
  if (!(await requireUser('/pages/booking/caregivers'))) return;
  try {
    const list = await listCaregivers();
    options.value = list.options;
    note.value = list.note;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loaded.value = true;
  }
});

function open(id: number) {
  uni.navigateTo({ url: `/pages/caregivers/detail?id=${id}&booking=1` });
}

function back() {
  if (getCurrentPages().length > 1) uni.navigateBack();
  else uni.redirectTo({ url: '/pages/booking/index' });
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 24rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card.off { opacity: 0.55; }
.head { display: flex; align-items: center; gap: 20rpx; }
.avatar { width: 88rpx; height: 88rpx; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--pp-background); color: var(--pp-primary-strong); font-weight: 700; font-size: 32rpx; }
.who { flex: 1; display: flex; flex-direction: column; }
.name { font-weight: 700; font-size: 30rpx; }
.more { color: var(--pp-muted); font-size: 40rpx; }
.badges { display: flex; flex-wrap: wrap; gap: 10rpx; }
.badge { padding: 4rpx 14rpx; border-radius: 999rpx; background: var(--pp-primary-strong); color: var(--pp-surface); font-size: 22rpx; font-weight: 600; }
.availability { font-size: 26rpx; font-weight: 600; color: var(--pp-primary-strong); }
.availability.clash { color: var(--pp-danger); }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.strong { font-weight: 700; }
.note { display: block; margin-bottom: 24rpx; padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); color: var(--pp-muted); font-size: 24rpx; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; margin-bottom: 16rpx; }
.ghost { background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-size: 28rpx; }
</style>
