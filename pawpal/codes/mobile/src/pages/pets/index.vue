<template>
  <view v-if="loaded" class="content">
    <view v-if="!pets.length" class="card empty" data-test="no-pets">
      <text class="big">No pets yet</text>
      <text class="muted">Add your cat or dog so caregivers know who they are looking after.</text>
    </view>

    <view v-for="pet in pets" :key="pet.id" class="card pet" data-test="pet" @click="open(pet)">
      <text class="icon">{{ PET_ICON[pet.kind] }}</text>
      <view class="info">
        <text class="name" data-test="pet-name">{{ pet.name }}</text>
        <text class="muted" data-test="pet-summary">{{ petSummary(pet, now) }}</text>
      </view>
      <text class="status" :class="pet.status" data-test="pet-status">{{ PET_STATUS_LABEL[pet.status] }}</text>
    </view>

    <button class="primary" data-test="add-pet" @click="edit()">Add pet</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { PET_STATUS_LABEL, petSummary, type Pet } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { listPets } from '@/api/pets';
import { PET_ICON, petLink } from '@/pets';

const pets = ref<Pet[]>([]);
const loaded = ref(false);
const now = new Date();

onShow(async () => {
  if (!(await requireUser('/pages/pets/index'))) return;
  pets.value = await listPets();
  loaded.value = true;
});

function open(pet: Pet) {
  uni.navigateTo({ url: petLink(pet) });
}

function edit() {
  uni.navigateTo({ url: '/pages/pets/edit' });
}
</script>

<style>
.content { padding: 32rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.empty { display: flex; flex-direction: column; gap: 8rpx; text-align: center; }
.big { font-size: 34rpx; font-weight: 700; }
.muted { color: var(--pp-muted); font-size: 26rpx; }
.pet { display: flex; align-items: center; gap: 24rpx; }
.icon { font-size: 56rpx; }
.info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
.name { font-size: 32rpx; font-weight: 700; }
.status { padding: 4rpx 18rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; border: 1px solid var(--pp-success); color: var(--pp-success); }
.status.pending, .status.needs_info { border-color: var(--pp-accent); color: var(--pp-ink); }
.status.rejected { border-color: var(--pp-danger); color: var(--pp-danger); }
.primary { margin-top: 8rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
