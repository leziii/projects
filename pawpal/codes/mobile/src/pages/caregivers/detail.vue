<template>
  <view v-if="card" class="content">
    <view v-if="preview" class="preview" data-test="preview-note">
      <text>This is how owners see you. Changes waiting for review are not shown yet.</text>
    </view>
    <view class="card head">
      <image v-if="photo" class="photo" :src="photo" mode="aspectFill" data-test="card-photo" />
      <view v-else class="photo initials" data-test="card-initials"><text>{{ card.initials }}</text></view>
      <view class="who">
        <text class="name" data-test="card-name">{{ card.displayName }}</text>
        <view class="badges">
          <text v-for="b in list" :key="b.key" class="badge" :data-test="`badge-${b.key}`" @click="info = info === b.info ? '' : b.info">✓ {{ b.label }}</text>
        </view>
        <text v-if="info" class="info" data-test="badge-info">{{ info }}</text>
      </view>
    </view>

    <view class="card">
      <view v-for="r in rows" :key="r.label" class="row">
        <text class="muted">{{ r.label }}</text>
        <text class="value" :data-test="`card-${r.label.toLowerCase().replace(/\s+/g, '-')}`">{{ r.value }}</text>
      </view>
      <text v-if="card.intro" class="intro" data-test="card-intro">{{ card.intro }}</text>
    </view>

    <view v-if="card.insurance" class="card insured" data-test="card-insurance">
      <text class="strong">🛡️ Insurance</text>
      <text class="muted">{{ card.insurance }}</text>
    </view>

    <view v-if="option" class="card" data-test="booking-box">
      <text class="strong">Your visits</text>
      <text class="availability" :class="{ clash: !option.free }" data-test="card-availability">{{ option.availability }}</text>
      <text class="muted">{{ freeNote }}</text>
      <text v-if="error" class="error" data-test="error">{{ error }}</text>
      <button class="primary" data-test="choose" :disabled="!option.free || busy" @click="choose">Choose {{ card.displayName }}</button>
    </view>

    <text class="muted center">PawPal never shares the caregiver's phone number. You talk through the app.</text>
  </view>
  <view v-else-if="gone" class="content">
    <text class="muted center" data-test="card-gone">This caregiver is not available.</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import type { CaregiverCard, CaregiverOption } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { chooseCaregiver, listCaregivers } from '@/api/booking';
import { caregiverPhotoUrl, getCaregiverCard } from '@/api/caregivers';
import { badges, cardRows } from '@/trust';

const card = ref<CaregiverCard | null>(null);
const photo = ref('');
const gone = ref(false);
const info = ref('');
const preview = ref(false);
/** Opened from the O07 list: how this booking's visits look for her, and "Choose" (R19-4). */
const option = ref<CaregiverOption | null>(null);
const freeNote = ref('');
const busy = ref(false);
const error = ref('');

const list = computed(() => (card.value ? badges(card.value) : []));
const rows = computed(() => (card.value ? cardRows(card.value) : []));

onLoad(async (q) => {
  const id = Number(q?.id);
  const u = await requireUser(`/pages/caregivers/detail?id=${id}`);
  if (!u) return;
  preview.value = u.id === id;
  try {
    card.value = await getCaregiverCard(id);
  } catch {
    gone.value = true;
    return;
  }
  if (card.value.hasPhoto) photo.value = await caregiverPhotoUrl(id).catch(() => '');
  if (q?.booking === '1') {
    const list = await listCaregivers().catch(() => null);
    option.value = list?.options.find((o) => o.card.id === id) ?? null;
    freeNote.value = list?.note ?? '';
  }
});

async function choose() {
  if (!card.value) return;
  busy.value = true;
  error.value = '';
  try {
    await chooseCaregiver(card.value.id);
    uni.showToast({ title: 'Caregiver chosen', icon: 'none' });
    // Back past the list to the booking setup.
    if (getCurrentPages().length > 2) uni.navigateBack({ delta: 2 });
    else uni.redirectTo({ url: '/pages/booking/index' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onUnload(() => photo.value && URL.revokeObjectURL(photo.value));
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.head { flex-direction: row; align-items: center; gap: 28rpx; }
.photo { width: 140rpx; height: 140rpx; flex: none; border-radius: 50%; background: var(--pp-background); }
.initials { display: flex; align-items: center; justify-content: center; font-size: 48rpx; font-weight: 700; color: var(--pp-primary-strong); }
.who { display: flex; flex-direction: column; gap: 10rpx; flex: 1; }
.name { font-size: 36rpx; font-weight: 700; }
.badges { display: flex; flex-wrap: wrap; gap: 12rpx; }
.badge { padding: 6rpx 18rpx; border-radius: 999rpx; background: var(--pp-primary-strong); color: var(--pp-surface); font-size: 24rpx; font-weight: 600; }
.info { font-size: 24rpx; color: var(--pp-muted); }
.row { display: flex; justify-content: space-between; gap: 24rpx; font-size: 28rpx; }
.value { text-align: right; font-weight: 600; }
.intro { margin-top: 8rpx; font-size: 28rpx; line-height: 1.5; }
.insured { border-color: var(--pp-primary-strong); }
.strong { font-weight: 700; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.center { text-align: center; }
.availability { font-size: 28rpx; font-weight: 600; color: var(--pp-primary-strong); }
.availability.clash { color: var(--pp-danger); }
.error { color: var(--pp-danger); font-size: 26rpx; }
.primary { margin-top: 8rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.preview { margin-bottom: 24rpx; padding: 20rpx 28rpx; border-radius: 12rpx; background: var(--pp-background); color: var(--pp-muted); font-size: 24rpx; }
</style>
