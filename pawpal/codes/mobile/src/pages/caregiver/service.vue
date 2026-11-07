<template>
  <view v-if="v" class="content">
    <view class="card">
      <view class="row">
        <text class="strong" data-test="service-when">{{ dayText(v.date) }} · {{ taskTime(v) }}</text>
        <text class="tag" data-test="service-status">{{ TASK_STATUS_LABEL[v.status] }}</text>
      </view>
      <text v-if="v.enteredAt" class="line" data-test="service-started">Started {{ clockOf(v.enteredAt) }}</text>
      <text v-if="v.enteredAt" class="served" :class="{ short: served < v.minMinutes }" data-test="served">{{ servedText(served, v.minMinutes) }}</text>
      <text class="note">{{ v.number }} · {{ taskPets(v) }}</text>
    </view>

    <view class="card">
      <text class="section">Checklist</text>
      <view
        v-for="c in v.checklist"
        :key="c.item"
        class="tick"
        :data-test="`check-${c.item}`"
        role="checkbox"
        :aria-checked="c.done"
        @click="toggle(c.item, !c.done)"
      >
        <view class="box" :class="{ on: c.done }">{{ c.done ? '✓' : '' }}</view>
        <text>{{ CHECK_LABEL[c.item] }}</text>
      </view>
    </view>

    <view class="card">
      <view class="row">
        <text class="section">Photos</text>
        <text class="note" data-test="photo-count">{{ photoCountText(v.photos.length) }}</text>
      </view>
      <VisitPhotos :order-id="id" :index="index" :photos="v.photos" @changed="show" @state="photoState = $event" @error="actionError = $event" />
      <text class="note">At least {{ SERVICE_RULES.minPhotos }} photos are needed for the report.</text>
    </view>

    <text v-if="actionError" class="error" data-test="action-error">{{ actionError }}</text>

    <view class="later-row">
      <button class="ghost" data-test="overtime" disabled>Request overtime</button>
      <button class="ghost" data-test="problem" disabled>Report a problem</button>
    </view>
    <text class="note center" data-test="later-note">Coming later</text>

    <text v-if="photoState !== 'none'" class="note center" data-test="finish-wait">{{ photoState === 'failed' ? 'A photo failed to upload. Tap ↻ to try again, or remove it' : 'Waiting for photos to upload' }}</text>
    <button class="primary" data-test="finish" :disabled="busy || photoState !== 'none'" @click="finish">Finish, write report</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
  CHECK_LABEL,
  SERVICE_RULES,
  TASK_STATUS_LABEL,
  dayText,
  finishEarlyText,
  photoCountText,
  servedMinutes,
  servedText,
  taskPets,
  taskTime,
  timeText,
  type CheckItem,
  type VisitTask,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { checkItem, getVisit } from '@/api/requests';
import VisitPhotos from '@/components/VisitPhotos.vue';
import { confirmBox } from '@/order-actions';

const v = ref<VisitTask | null>(null);
const error = ref('');
const actionError = ref('');
const busy = ref(false);
const photoState = ref<'none' | 'uploading' | 'failed'>('none');
const now = ref(new Date());
const id = ref(0);
const index = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

/** R36-2: from the entry time, updated every minute. */
const served = computed(() => (v.value?.enteredAt ? servedMinutes(v.value.enteredAt, now.value) : 0));
const clockOf = (at: string) => timeText(Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16)));

function show(next: VisitTask) {
  v.value = next;
  now.value = new Date();
}

async function load() {
  try {
    show(await getVisit(id.value, index.value));
    if (v.value!.status !== 'in_service') uni.redirectTo({ url: `/pages/caregiver/visit?id=${id.value}&i=${index.value}` });
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function act(run: () => Promise<VisitTask>) {
  actionError.value = '';
  try {
    show(await run());
  } catch (e) {
    actionError.value = (e as Error).message;
  }
}

/** R36-3: saved at once. */
const toggle = (item: CheckItem, done: boolean) => act(() => checkItem(id.value, index.value, item, done));

/** R36-5: ask first when under the minimum time. */
async function finish() {
  const warn = finishEarlyText(served.value, v.value!.minMinutes);
  if (warn && !(await confirmBox('Finish early', warn))) return;
  uni.navigateTo({ url: `/pages/caregiver/report?id=${id.value}&i=${index.value}` });
}

onLoad((q) => {
  id.value = Number(q?.id) || 0;
  index.value = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/caregiver/service?id=${id.value}&i=${index.value}`))) return;
  await load();
  if (timer) clearInterval(timer);
  timer = setInterval(() => (now.value = new Date()), 60_000);
});
const stop = () => {
  if (timer) clearInterval(timer);
  timer = undefined;
};
onHide(stop);
onUnload(stop);
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; gap: 16rpx; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.served { font-size: 32rpx; font-weight: 700; color: var(--pp-primary-strong); }
.served.short { color: var(--pp-ink); }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-primary-strong); color: var(--pp-surface); }
.tick { display: flex; align-items: center; gap: 16rpx; font-size: 28rpx; padding: 10rpx 0; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.later-row { display: flex; gap: 16rpx; }
.ghost { flex: 1; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-size: 28rpx; }
.ghost[disabled] { background: var(--pp-surface) !important; color: var(--pp-muted) !important; border-color: var(--pp-border); }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.error { color: var(--pp-danger); }
</style>
