<template>
  <view v-if="profile" class="content">
    <view class="card">
      <text class="section">Verified (read only)</text>
      <view class="row"><text>Name owners see</text><text class="strong" data-test="display-name">{{ profile.displayName }}</text></view>
      <view class="row"><text>Identity</text><text class="ok">✓ Verified</text></view>
      <view class="row"><text>Care guide</text><text class="ok">✓ Read</text></view>
      <text class="muted">To change your name or IC number, contact support.</text>
      <text class="link" data-test="preview-card" @click="previewCard">Preview how owners see me ›</text>
    </view>

    <view v-if="profile.pending" class="card notice" data-test="pending">
      <text class="strong">{{ pendingText(profile) }}</text>
      <text class="muted">You keep your current details until PawPal approves.</text>
    </view>
    <view v-if="profile.lastRejected" class="card notice" data-test="last-rejected">
      <text class="strong">Last change not approved</text>
      <text class="muted" data-test="rejected-reason">{{ profile.lastRejected }}</text>
    </view>

    <view class="card">
      <text class="section">Profile photo (optional)</text>
      <view class="photo-row">
        <image v-if="photos.current" class="photo" :src="photos.current" mode="aspectFill" data-test="current-photo" />
        <view v-else class="photo empty"><text class="muted">No photo</text></view>
        <view class="photo-side">
          <text class="ghost-btn" data-test="add-photo" @click="pickPhoto">{{ profile.hasPhoto || profile.pending?.photo ? 'Change photo' : 'Add photo' }}</text>
          <text class="muted">PawPal checks it against your IC selfie before owners see it.</text>
        </view>
      </view>
      <image v-if="photos.pending" class="photo" :src="photos.pending" mode="aspectFill" data-test="pending-photo" />
    </view>

    <view class="card">
      <text class="section">Services</text>
      <text class="muted">Now: {{ abilitySummary(profile) }}</text>
      <view class="choices">
        <text class="choice" :class="{ on: form.cats }" data-test="cats" @click="form.cats = !form.cats">🐱 Cats</text>
        <text class="choice" :class="{ on: form.dogs }" data-test="dogs" @click="form.dogs = !form.dogs">🐶 Dogs</text>
      </view>
      <template v-if="form.dogs">
        <text class="label">Largest dog I can handle</text>
        <view class="choices wrap">
          <text v-for="s in DOG_SIZES" :key="s" class="choice" :class="{ on: form.maxDogSize === s }" :data-test="`size-${s}`" @click="form.maxDogSize = s">{{ DOG_SIZE_LABEL[s] }}</text>
        </view>
      </template>
      <text v-if="hint" class="hint" data-test="review-hint">{{ hint }}</text>

      <text class="label">Areas I work in</text>
      <view class="choices wrap">
        <text v-for="a in AREAS" :key="a" class="choice small" :class="{ on: form.areas.includes(a) }" :data-test="`area-${a}`" @click="form.areas = toggleArea(form.areas, a)">{{ a }}</text>
      </view>

      <text class="label">Years of pet care experience</text>
      <input v-model="form.years" class="input" data-test="years" type="number">

      <text class="label">Short intro for owners</text>
      <textarea v-model="form.intro" class="textarea" data-test="intro" :maxlength="PROFILE_RULES.introMax" placeholder="e.g. Cat owner for 10 years, calm with shy cats." />
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="primary" data-test="save" :disabled="busy" @click="save">Save</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { AREAS, DOG_SIZES, DOG_SIZE_LABEL, PROFILE_RULES, type CaregiverProfile } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getProfile, profilePhotoUrl, saveProfile, uploadProfilePhoto } from '@/api/profile';
import { toggleArea } from '@/apply';
import { settleInputs } from '@/inputs';
import { photoProblem } from '@/pets';
import { abilitySummary, pendingText, profileFormToInput, profileToForm, reviewHint, type ProfileForm } from '@/profile';

const profile = ref<CaregiverProfile | null>(null);
const myId = ref(0);
const form = ref<ProfileForm>({ cats: false, dogs: false, maxDogSize: null, areas: [], years: '', intro: '' });
const photos = ref<{ current?: string; pending?: string }>({});
const busy = ref(false);
const error = ref('');

const hint = computed(() => (profile.value ? reviewHint(profile.value, form.value) : ''));

onShow(async () => {
  const u = await requireUser('/pages/caregiver/profile');
  if (!u) return;
  myId.value = u.id;
  // Only approved caregivers have a profile; others see where their application stands.
  if (u.caregiverStatus !== 'approved') {
    uni.redirectTo({ url: '/pages/apply/status' });
    return;
  }
  show(await getProfile());
});
onUnload(() => clearPhotos());

function clearPhotos() {
  Object.values(photos.value).forEach((u) => u && URL.revokeObjectURL(u));
  photos.value = {};
}

function show(p: CaregiverProfile) {
  profile.value = p;
  form.value = profileToForm(p);
  clearPhotos();
  if (p.hasPhoto) profilePhotoUrl('current').then((u) => (photos.value = { ...photos.value, current: u })).catch(() => {});
  if (p.pending?.photo) profilePhotoUrl('pending').then((u) => (photos.value = { ...photos.value, pending: u })).catch(() => {});
}

function previewCard() {
  uni.navigateTo({ url: `/pages/caregivers/detail?id=${myId.value}` });
}

function pickPhoto() {
  uni.chooseImage({ count: 1, sourceType: ['album', 'camera'], success: (res) => usePhoto((res.tempFiles as File[])[0]) });
}

async function usePhoto(file: File | undefined) {
  if (!file) return;
  error.value = photoProblem(file);
  if (error.value) return;
  busy.value = true;
  try {
    show(await uploadProfilePhoto(file));
    uni.showToast({ title: 'Photo sent for review', icon: 'none' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function save() {
  error.value = '';
  busy.value = true;
  try {
    await settleInputs();
    const saved = await saveProfile(profileFormToInput(form.value));
    show(saved);
    uni.showToast({ title: saved.pending?.ability ? 'Saved. Dog change sent for review' : 'Saved', icon: 'none' });
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
.notice { border-color: var(--pp-accent); }
.section { font-weight: 700; font-size: 30rpx; }
.row { display: flex; justify-content: space-between; font-size: 28rpx; }
.strong { font-weight: 700; }
.ok { color: var(--pp-primary-strong); font-weight: 600; }
.label { display: block; font-weight: 600; font-size: 26rpx; margin: 20rpx 0 6rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.hint { display: block; color: var(--pp-primary-strong); font-size: 24rpx; margin-top: 8rpx; }
.choices { display: flex; gap: 16rpx; align-items: center; margin-top: 8rpx; }
.choices.wrap { flex-wrap: wrap; }
.choice { padding: 14rpx 32rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; }
.choice.small { padding: 10rpx 24rpx; font-size: 26rpx; }
.choice.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.input { height: 88rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; background: var(--pp-surface); color: var(--pp-ink); }
.textarea { width: auto; height: 160rpx; padding: 16rpx 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.photo-row { display: flex; gap: 20rpx; align-items: center; }
.photo-side { display: flex; flex-direction: column; gap: 10rpx; flex: 1; }
.photo { width: 160rpx; height: 160rpx; border-radius: 50%; background: var(--pp-background); }
.photo.empty { display: flex; align-items: center; justify-content: center; }
.ghost-btn { align-self: flex-start; padding: 14rpx 28rpx; border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); color: var(--pp-primary-strong); font-size: 26rpx; }
.link { margin-top: 8rpx; color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.error { display: block; margin-bottom: 16rpx; color: var(--pp-danger); font-size: 26rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
