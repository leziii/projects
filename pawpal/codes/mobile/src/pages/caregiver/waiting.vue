<template>
  <view v-if="v && w" class="content">
    <view class="card" data-test="waiting-card">
      <text class="section">Visit {{ v.index + 1 }} · {{ v.number }}</text>
      <text class="big" :class="{ limit: w.limitReached && !w.stopped }" data-test="waiting-text">{{ waitingText(w) }}</text>
      <view class="row"><text class="note">Minutes</text><text class="strong" data-test="waiting-minutes">{{ w.started || w.stopped ? `${w.minutes} min` : '—' }}</text></view>
      <view class="row"><text class="note">Fee so far</text><text class="strong" data-test="waiting-fee">{{ formatRM(w.feeSen) }}</text></view>
      <text class="note" data-test="waiting-rule">{{ WAITING_RULE_TEXT }}</text>
      <text class="note">Counts from {{ startText }} (the later of the booked start and when you arrived) until you get in. It is not service time.</text>
      <text class="note" data-test="waiting-sent">Sent to the owner {{ sentText }}. The owner will be asked to prepay {{ formatRM(WAITING_RULES.maxSen) }}; what is not used goes back to them.</text>
    </view>

    <view v-if="w.limitReached && !w.stopped" class="card" data-test="waiting-limit">
      <text class="warn">Waiting limit reached.</text>
      <text class="note">If the owner still cannot let you in, ask us for help.</text>
      <HelpButton :order-no="v.number" label="Help with this visit" />
    </view>

    <button v-if="v.status === 'in_service'" class="primary" data-test="continue-service" @click="openService">Continue service</button>
    <button v-else class="ghost" data-test="back-to-visit" @click="back">Back to visit</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { WAITING_RULES, WAITING_RULE_TEXT, formatRM, klInstant, timeText, waitingState, waitingText, type VisitTask } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getVisit } from '@/api/requests';
import HelpButton from '@/components/HelpButton.vue';

/** E11-1 S14 (round 45): the waiting clock and fee while the owner is not ready. */
const v = ref<VisitTask | null>(null);
const error = ref('');
const now = ref(new Date());
let id = 0;
let index = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const w = computed(() => (v.value?.arrivedAt ? waitingState(v.value, now.value) : null));
const klClock = (d: Date) => {
  const kl = new Date(d.getTime() + 8 * 3600_000);
  return timeText(kl.getUTCHours() * 60 + kl.getUTCMinutes());
};
const startText = computed(() => (w.value ? klClock(w.value.startAt) : ''));
const sentText = computed(() => (v.value?.waitingAt ? `at ${klClock(klInstant(v.value.waitingAt))}` : ''));

async function load() {
  try {
    v.value = await getVisit(id, index);
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

/** The clock moves every 10 s; the owner may let the caregiver in at any time. */
function startPoll() {
  stopPoll();
  timer = setInterval(() => {
    if (v.value?.status === 'arrived') void load();
  }, 10_000);
}
function stopPoll() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/caregiver/waiting?id=${id}&i=${index}`))) return;
  await load();
  startPoll();
});
onHide(stopPoll);
onUnload(stopPoll);

const openService = () => uni.redirectTo({ url: `/pages/caregiver/service?id=${id}&i=${index}` });
const back = () => (getCurrentPages().length > 1 ? uni.navigateBack() : uni.redirectTo({ url: `/pages/caregiver/visit?id=${id}&i=${index}` }));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.big { font-weight: 700; font-size: 36rpx; color: var(--pp-primary-strong); }
.big.limit { color: var(--pp-danger); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; }
.strong { font-weight: 600; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.warn { color: var(--pp-danger); font-weight: 600; font-size: 28rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
