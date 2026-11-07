<template>
  <view v-if="v" class="content">
    <view class="card">
      <view class="row">
        <text class="strong" data-test="visit-when">{{ dayText(v.date) }} · {{ taskTime(v) }}</text>
        <text class="tag" :class="v.status" data-test="visit-status">{{ TASK_STATUS_LABEL[v.status] }}</text>
      </view>
      <text class="line" data-test="visit-service">{{ visitServiceText(v) }}</text>
      <view class="row">
        <view class="copyable" data-test="copy-number" @click="copyText(v.number, 'Order number copied')">
          <text class="note" data-test="visit-number">{{ v.number }}</text>
          <view class="copy-icon" aria-label="Copy"><view class="sheet back" /><view class="sheet front" /></view>
        </view>
        <text class="income" data-test="visit-income">You earn {{ formatRM(v.incomeSen) }}</text>
      </view>
      <text v-if="v.status === 'cancelled'" class="error" data-test="visit-cancelled">This visit was cancelled.</text>
    </view>

    <view class="card">
      <text class="section">Pets</text>
      <view v-for="p in v.petDetails" :key="p.name" class="pet" data-test="pet">
        <text class="strong" data-test="pet-name">{{ p.name }} · {{ p.kind === 'dog' ? 'Dog' : 'Cat' }}</text>
        <text class="note" data-test="pet-facts">{{ petFacts(p) }}</text>
        <text v-if="p.healthNote" class="line" data-test="pet-health">Health: {{ p.healthNote }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">Getting in</text>
      <view class="row"><text class="note">Method</text><text data-test="entry-method">{{ ENTRY_METHOD_LABEL[v.entryMethod].title }}</text></view>
      <template v-if="v.entry">
        <view class="row" data-test="entry-key"><text class="note">Key or lock</text><text>{{ v.entry.keyLock || '—' }}</text></view>
        <view class="row" data-test="entry-guard"><text class="note">Guard or reception</text><text>{{ v.entry.guard || '—' }}</text></view>
        <view class="row" data-test="entry-notes"><text class="note">Notes</text><text>{{ v.entry.notes || '—' }}</text></view>
      </template>
      <text v-else-if="v.status !== 'cancelled'" class="note" data-test="entry-later">🔒 {{ entryLockedText(v, now) }}</text>
    </view>

    <view v-if="v.address" class="card">
      <text class="section">Address</text>
      <text class="line" data-test="visit-address">{{ v.address.unit }}, {{ v.address.street }}, {{ v.address.postcode }} {{ v.address.area }}</text>
      <view class="row">
        <text class="line" data-test="visit-contact">{{ v.address.contactName }} · {{ v.address.contactPhone }}</text>
        <text class="link" data-test="call" @click="call">Call</text>
      </view>
    </view>

    <view v-if="v.status === 'todo'" class="actions">
      <button class="primary" data-test="arrive" :disabled="busy || !canArrive(v, now)" @click="arrive">I've arrived</button>
      <text v-if="!canArrive(v, now)" class="note center" data-test="arrive-note">{{ arriveFromText(v) }}</text>
      <text v-else class="note center" data-test="arrive-note">Tap when you reach the door. Waiting outside is not service time.</text>
    </view>

    <view v-else-if="v.status === 'arrived'" class="card" data-test="entry-step">
      <text class="strong" data-test="arrived-at">{{ arrivedText(v.arrivedAt!) }}</text>
      <template v-if="v.entryMethod === 'pre_authorised'">
        <view class="tick" data-test="entered-tick" role="checkbox" :aria-checked="entered" @click="entered = !entered">
          <view class="box" :class="{ on: entered }">{{ entered ? '✓' : '' }}</view>
          <text>I got in</text>
        </view>
        <button class="primary" data-test="confirm-entry" :disabled="busy || !entered" @click="enter">Confirm entry</button>
      </template>
      <text v-else class="note" data-test="waiting-owner">Waiting for the owner to confirm</text>
    </view>

    <view v-else-if="v.status === 'in_service'" class="card" data-test="in-service">
      <text class="strong">{{ arrivedText(v.arrivedAt!) }}</text>
      <text class="strong" data-test="entered-at">{{ enteredText(v.enteredAt!, v.enteredBy!, 'caregiver') }}</text>
      <button class="primary" data-test="continue-service" @click="openService">Continue service</button>
    </view>
    <text v-if="actionError" class="error" data-test="action-error">{{ actionError }}</text>

    <view v-if="v.status !== 'cancelled'" class="card"><HelpButton :order-no="v.number" label="Problem getting in?" /></view>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onLoad, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app';
import {
  ENTRY_METHOD_LABEL,
  TASK_STATUS_LABEL,
  ageText,
  arriveFromText,
  arrivedText,
  canArrive,
  dayText,
  enteredText,
  entryLockedText,
  formatRM,
  taskTime,
  visitServiceText,
  type VisitPet,
  type VisitTask,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { arriveVisit, enterVisit, getVisit } from '@/api/requests';
import HelpButton from '@/components/HelpButton.vue';
import { copyText } from '@/copy';

const v = ref<VisitTask | null>(null);
const error = ref('');
const now = ref(new Date());
let id = 0;
let index = 0;

const busy = ref(false);
const entered = ref(false);
const actionError = ref('');
/** R35-4: while waiting for the owner, and while "I've arrived" is not open yet, check again every 10 s. */
const POLL_MS = 10_000;
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    v.value = await getVisit(id, index);
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function startPoll() {
  stopPoll();
  timer = setInterval(() => {
    if (busy.value || !v.value) return;
    if (v.value.status === 'arrived' && v.value.entryMethod === 'live_confirm') {
      // R36-1: the owner let them in, so the service page opens.
      void load().then(() => {
        if (v.value?.status === 'in_service') openService();
      });
    }
    else now.value = new Date();
  }, POLL_MS);
}
function stopPoll() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

async function act(run: () => Promise<VisitTask>) {
  busy.value = true;
  actionError.value = '';
  try {
    v.value = await run();
    now.value = new Date();
  } catch (e) {
    actionError.value = (e as Error).message;
    await load();
  } finally {
    busy.value = false;
  }
}

/** R35-2 */
const arrive = () => act(() => arriveVisit(id, index));
/** R35-3, R36-1: once in, the service page opens. */
async function enter() {
  await act(() => enterVisit(id, index));
  if (v.value?.status === 'in_service') openService();
}

function openService() {
  uni.navigateTo({ url: `/pages/caregiver/service?id=${id}&i=${index}` });
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/caregiver/visit?id=${id}&i=${index}`))) return;
  await load();
  startPoll();
});
onHide(stopPoll);
onUnload(stopPoll);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

/** "Beagle · 3 yrs · 10 kg" */
function petFacts(p: VisitPet): string {
  return [p.breed, ageText(p.birth, now.value), p.weightKg === null ? null : `${p.weightKg} kg`].filter(Boolean).join(' · ');
}

/** R34-5 */
function call() {
  uni.makePhoneCall({ phoneNumber: v.value!.address!.contactPhone });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; gap: 16rpx; }
.copyable { display: flex; gap: 16rpx; align-items: center; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.income { font-weight: 600; color: var(--pp-primary-strong); }
.pet { display: flex; flex-direction: column; gap: 4rpx; padding: 8rpx 0; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.tag.cancelled { color: var(--pp-danger); }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.actions { display: flex; flex-direction: column; gap: 12rpx; }
.tick { display: flex; align-items: center; gap: 16rpx; font-size: 28rpx; padding: 8rpx 0; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.tag.arrived, .tag.in_service { background: var(--pp-primary-strong); color: var(--pp-surface); }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.error { color: var(--pp-danger); }
</style>
