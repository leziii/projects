<template>
  <view v-if="offer" class="content">
    <view class="card">
      <text class="section">Order {{ offer.number }}</text>
      <text class="line" data-test="sub-problem">What happened: {{ offer.problem }} ({{ offer.from }})</text>
      <text class="note" data-test="sub-reason">{{ offer.reason }}</text>
    </view>

    <view class="card" data-test="sub-caregiver">
      <view class="who-row">
        <image v-if="photo" class="photo" :src="photo" mode="aspectFill" data-test="sub-photo" />
        <view v-else class="photo initials" data-test="sub-initials"><text>{{ offer.caregiver.initials }}</text></view>
        <view class="who">
          <text class="strong" data-test="sub-name">{{ offer.caregiver.displayName }}</text>
          <text v-if="offer.caregiver.idVerified" class="badge" data-test="sub-verified">ID verified</text>
          <text class="note">{{ offer.caregiver.experienceYears }} years' experience</text>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="section">Visits {{ offer.caregiver.displayName }} takes</text>
      <text v-for="v in offer.visits" :key="v.index" class="line" data-test="sub-visit">Visit {{ v.index + 1 }} · {{ substituteVisitText(v) }}</text>
      <text class="ok" data-test="sub-price">Price unchanged, nothing to pay.</text>
    </view>

    <template v-if="offer.status === 'waiting'">
      <text class="note" data-test="sub-answer-by">Please answer by {{ klAtText(offer.answerBy) }}. If you don't, we refund these visits in full.</text>
      <text v-if="error" class="error" data-test="error">{{ error }}</text>
      <button class="primary" data-test="approve-substitute" :disabled="busy" @click="approve">Approve {{ offer.caregiver.displayName }}</button>
      <button class="danger-ghost" data-test="decline-substitute" :disabled="busy" @click="decline">Decline · refund these visits</button>
    </template>
    <view v-else class="card" data-test="sub-done">
      <text class="strong" data-test="sub-status">{{ SUBSTITUTE_STATUS_LABEL[offer.status] }}</text>
      <text v-if="offer.newOrder" class="link" data-test="open-new-order" @click="openNew">See order {{ offer.newOrder.number }} ›</text>
      <text v-else class="note">These visits are refunded in full. See the order for the refund.</text>
    </view>
  </view>
  <view v-else-if="error || empty" class="content">
    <text class="error" data-test="error">{{ error || 'No substitute on this order.' }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { SUBSTITUTE_STATUS_LABEL, klAtText, substituteVisitText, type SubstituteOffer } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { approveSubstitute, declineSubstitute, getSubstitute } from '@/api/booking';
import { caregiverPhotoUrl } from '@/api/caregivers';
import { confirmBox } from '@/order-actions';

/** E12-4 O20 (R52-3 … R52-5): our team found another caregiver; the owner approves or declines. */
const offer = ref<SubstituteOffer | null>(null);
const photo = ref('');
const error = ref('');
const empty = ref(false);
const busy = ref(false);
let id = 0;

async function load() {
  try {
    offer.value = (await getSubstitute(id)).offer;
    empty.value = !offer.value;
    if (offer.value?.caregiver.hasPhoto && !photo.value) photo.value = await caregiverPhotoUrl(offer.value.caregiver.id).catch(() => '');
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  if (!(await requireUser(`/pages/orders/substitute?id=${id}`))) return;
  await load();
});
onUnload(() => photo.value && URL.revokeObjectURL(photo.value));

async function answer(go: () => Promise<SubstituteOffer>, done: string) {
  error.value = '';
  busy.value = true;
  try {
    offer.value = await go();
    uni.showToast({ title: done, icon: 'success' });
  } catch (e) {
    error.value = (e as Error).message;
    await load();
  } finally {
    busy.value = false;
  }
}

const approve = () => answer(() => approveSubstitute(id), 'Approved');

async function decline() {
  if (!(await confirmBox('Decline substitute', 'These visits will be cancelled and refunded in full.'))) return;
  await answer(() => declineSubstitute(id), 'Declined');
}

const openNew = () => uni.redirectTo({ url: `/pages/orders/detail?id=${offer.value!.newOrder!.id}` });
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; font-size: 30rpx; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.who-row { display: flex; gap: 24rpx; align-items: center; }
.who { display: flex; flex-direction: column; gap: 6rpx; flex: 1; }
.photo { width: 120rpx; height: 120rpx; flex: none; border-radius: 50%; background: var(--pp-background); }
.initials { display: flex; align-items: center; justify-content: center; font-size: 44rpx; font-weight: 700; color: var(--pp-primary-strong); }
.badge { align-self: flex-start; padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; color: var(--pp-primary-strong); background: var(--pp-background); }
.ok { color: var(--pp-primary-strong); font-size: 28rpx; font-weight: 600; }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 28rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
</style>
