<template>
  <view v-if="report" class="content">
    <view class="card">
      <view class="row">
        <text class="strong" data-test="report-when">{{ visitWhen(report) }}</text>
        <text class="tag" data-test="report-visit">Visit {{ report.index + 1 }}</text>
      </view>
      <text class="note" data-test="report-caregiver">By {{ report.caregiver }} · {{ report.number }}</text>
    </view>

    <view class="card">
      <text class="section">Photos ({{ report.photos.length }})</text>
      <view class="photos">
        <view v-for="pid in report.photos" :key="pid" class="photo" data-test="report-photo" @click="preview(pid)">
          <image v-if="urls[pid]" :src="urls[pid]" mode="aspectFill" class="img" />
        </view>
      </view>
      <text class="note">Tap a photo to see it full size.</text>
    </view>

    <view class="card">
      <text class="section">What was done</text>
      <view v-for="c in report.checklist" :key="c.item" class="row" data-test="report-check">
        <text>{{ CHECK_LABEL[c.item] }}</text>
        <text :class="c.done ? 'done' : 'missed'">{{ c.done ? '✓ Done' : '✗ Not done' }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">Note from {{ report.caregiver }}</text>
      <text :class="report.note ? 'body' : 'later'" data-test="report-note">{{ report.note || 'No note' }}</text>
    </view>

    <view class="card">
      <text class="section">Check</text>
      <text class="note" data-test="report-sent">{{ reportSentText(report.reportedAt) }}</text>
      <text class="strong" data-test="report-deadline">{{ checkByText(report.reportedAt) }}</text>
      <template v-if="report.status === 'report_sent'">
        <text class="note">If you do nothing, the visit is confirmed automatically after {{ REPORT_RULES.confirmHours }} h.</text>
        <button class="primary" data-test="confirm-report" :disabled="busy" @click="confirm">Confirm, all good</button>
        <button class="ghost danger" data-test="raise-problem" @click="openProblem">Raise a problem</button>
      </template>
      <text v-else-if="report.status === 'confirmed'" class="ok" data-test="report-confirmed">✓ {{ confirmedText(report.confirmedAt!, report.confirmedBy!, 'owner') }}</text>
      <template v-else>
        <text class="warn" data-test="report-disputed">Under review: you raised a problem.</text>
        <button class="ghost" data-test="view-case" @click="openProblem">View the problem</button>
      </template>
      <text v-if="actionError" class="error" data-test="action-error">{{ actionError }}</text>
    </view>

    <view class="card"><HelpButton :order-no="report.number" label="Help with this report" /></view>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { CHECK_LABEL, REPORT_RULES, checkByText, confirmedText, reportSentText, visitWhen, type VisitReport } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { confirmReport, getReport, getReportByRun, reportPhotoUrl } from '@/api/booking';
import { confirmBox } from '@/order-actions';
import HelpButton from '@/components/HelpButton.vue';

/** O17 (E9-1, E9-2): the owner reads a visit's sent report, then confirms it or raises a problem (R39, R40). */
const report = ref<VisitReport | null>(null);
const error = ref('');
const urls = reactive<Record<number, string>>({});
let id = 0;
let index = 0;
let run = 0;

async function load() {
  try {
    const r = run ? await getReportByRun(run) : await getReport(id, index);
    report.value = r;
    for (const pid of r.photos) {
      if (!urls[pid]) reportPhotoUrl(r.orderId, r.index, pid).then((u) => (urls[pid] = u)).catch(() => undefined);
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const busy = ref(false);
const actionError = ref('');

/** R40-1: one tap with an OK popup; cannot be undone. */
async function confirm() {
  const r = report.value!;
  if (!(await confirmBox('Confirm visit', `Confirm visit ${r.index + 1} went well? This can't be undone.`))) return;
  busy.value = true;
  actionError.value = '';
  try {
    report.value = await confirmReport(r.orderId, r.index);
  } catch (e) {
    actionError.value = (e as Error).message;
    await load();
  } finally {
    busy.value = false;
  }
}

const openProblem = () => uni.navigateTo({ url: `/pages/orders/problem?id=${report.value!.orderId}&i=${report.value!.index}` });

function preview(pid: number) {
  const list = report.value!.photos.map((p) => urls[p]).filter(Boolean);
  if (urls[pid]) uni.previewImage({ urls: list, current: urls[pid] });
}

const here = () => (run ? `/pages/orders/report?run=${run}` : `/pages/orders/report?id=${id}&i=${index}`);

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
  run = Number(q?.run) || 0;
});
onShow(async () => {
  if (!(await requireUser(here()))) return;
  await load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.body { font-size: 28rpx; line-height: 1.5; white-space: pre-wrap; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.later { font-size: 26rpx; color: var(--pp-muted); font-style: italic; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.done { color: var(--pp-primary-strong); font-weight: 600; }
.missed { color: var(--pp-danger); font-weight: 600; }
.error { color: var(--pp-danger); }
.ok { color: var(--pp-primary-strong); font-weight: 600; font-size: 28rpx; }
.warn { color: var(--pp-danger); font-weight: 600; font-size: 28rpx; }
.primary { width: 100%; margin-top: 8rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost.danger { color: var(--pp-danger); border-color: var(--pp-danger); }
.ghost { width: 100%; margin-top: 8rpx; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
.photos { display: flex; flex-wrap: wrap; gap: 16rpx; }
.photo { width: 196rpx; height: 196rpx; border-radius: 12rpx; overflow: hidden; background: var(--pp-background); }
.img { width: 100%; height: 100%; }
</style>
