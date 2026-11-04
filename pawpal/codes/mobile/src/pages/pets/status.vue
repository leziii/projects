<template>
  <view v-if="pet && view" class="content">
    <view class="card head">
      <text class="icon">{{ PET_ICON[pet.kind] }}</text>
      <view class="info">
        <text class="name">{{ pet.name }}</text>
        <text class="muted">{{ petSummary(pet, now) }}</text>
      </view>
    </view>

    <view class="card">
      <text class="label">Status</text>
      <text class="status" :class="pet.status" data-test="status">{{ PET_STATUS_LABEL[pet.status] }}</text>
      <text class="help" data-test="status-help">{{ view.help }}</text>
      <view v-if="view.reasons.length" class="block" data-test="check-reasons">
        <text class="label">What we check</text>
        <text v-for="r in view.reasons" :key="r" class="reason">· {{ r }}</text>
      </view>
      <view v-if="view.note" class="block note" data-test="admin-note">
        <text class="label">{{ view.noteTitle }}</text>
        <text>{{ view.note }}</text>
      </view>
    </view>

    <view class="card">
      <text class="label">What you sent</text>
      <text class="line">Vaccinated: {{ pet.vaccinated && pet.lastVaccine ? `yes, last ${MONTHS[pet.lastVaccine.month - 1]} ${pet.lastVaccine.year}` : 'no' }}</text>
      <text class="line" data-test="photo-sent">Vaccine card photo: {{ pet.hasVaccinePhoto ? 'sent' : 'not sent' }}</text>
      <text v-if="pet.healthNote" class="line">Health notes: {{ pet.healthNote }}</text>
    </view>

    <button v-if="view.action !== 'none'" class="primary" data-test="update" @click="edit">{{ view.action === 'update' ? 'Update profile' : 'Edit profile' }}</button>
    <view v-else class="card"><HelpButton label="Questions? Contact support" /></view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { PET_STATUS_LABEL, petSummary, type Pet } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getPet } from '@/api/pets';
import HelpButton from '@/components/HelpButton.vue';
import { MONTHS, PET_ICON, statusView } from '@/pets';

const pet = ref<Pet | null>(null);
const view = computed(() => (pet.value ? statusView(pet.value) : null));
const now = new Date();
let id = 0;

onLoad((query) => {
  id = Number(query?.id);
});

// onShow also reloads after coming back from the form.
onShow(async () => {
  if (!id || !(await requireUser(`/pages/pets/status?id=${id}`))) return;
  pet.value = await getPet(id);
});

function edit() {
  uni.navigateTo({ url: `/pages/pets/edit?id=${id}` });
}
</script>

<style>
.content { padding: 32rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.head { display: flex; align-items: center; gap: 24rpx; }
.icon { font-size: 56rpx; }
.info { display: flex; flex-direction: column; gap: 4rpx; }
.name { font-size: 34rpx; font-weight: 700; }
.muted { color: var(--pp-muted); font-size: 26rpx; }
.label { display: block; font-weight: 600; font-size: 26rpx; margin-bottom: 8rpx; color: var(--pp-muted); }
.status { display: inline-block; padding: 4rpx 18rpx; border-radius: 999rpx; font-size: 28rpx; font-weight: 700; border: 1px solid var(--pp-success); color: var(--pp-success); }
.status.pending, .status.needs_info { border-color: var(--pp-accent); color: var(--pp-ink); }
.status.rejected { border-color: var(--pp-danger); color: var(--pp-danger); }
.help { display: block; margin-top: 16rpx; }
.block { display: flex; flex-direction: column; margin-top: 24rpx; }
.note { padding: 20rpx; border-radius: 12rpx; background: var(--pp-background); }
.reason, .line { display: block; margin-top: 6rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
