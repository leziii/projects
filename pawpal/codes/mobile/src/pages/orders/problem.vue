<template>
  <view class="content">
    <view v-if="sent" class="card" data-test="case">
      <view class="row">
        <text class="section">{{ CASE_KIND_LABEL[sent.kind] }}</text>
        <text class="tag" data-test="case-status">{{ CASE_STATUS_LABEL[sent.status] }}</text>
      </view>
      <text class="note">Order {{ sent.number }} · visit {{ sent.index + 1 }}</text>
      <text class="body" data-test="case-description">{{ sent.description }}</text>
      <view v-if="sent.photos.length" class="photos">
        <view v-for="pid in sent.photos" :key="pid" class="photo" data-test="case-photo">
          <image v-if="urls[pid]" :src="urls[pid]" mode="aspectFill" class="img" />
        </view>
      </view>
      <view class="steps">
        <text class="step done" data-test="step-sent">✓ Sent {{ klAtText(sent.createdAt) }}</text>
        <text class="step" :class="{ done: sent.reviewingAt }" data-test="step-review">{{ sent.reviewingAt ? `✓ Under review since ${klAtText(sent.reviewingAt)}` : '○ Under review' }}</text>
        <text class="step" data-test="step-decision">○ Decision: we will message you</text>
      </view>
      <text class="note">Payout to the caregiver is on hold while we look into this. Your other visits go ahead as booked.</text>
    </view>

    <template v-else-if="ready">
      <view class="card">
        <text class="section">What went wrong?</text>
        <view class="kinds">
          <text v-for="k in CASE_KINDS" :key="k" class="kind" :class="{ on: kind === k }" :data-test="`kind-${k}`" @click="kind = k">{{ CASE_KIND_LABEL[k] }}</text>
        </view>
      </view>
      <view class="card">
        <text class="section">Tell us more</text>
        <textarea v-model="description" class="textarea" data-test="description" :maxlength="CASE_RULES.descriptionMax" placeholder="What happened? e.g. the litter box was not cleaned" />
        <text class="note right" data-test="description-count">{{ description.length }} / {{ CASE_RULES.descriptionMax }}</text>
      </view>
      <view class="card">
        <text class="section">Photos (optional, up to {{ CASE_RULES.maxPhotos }})</text>
        <view class="photos">
          <view v-for="(p, n) in photos" :key="p.preview" class="photo" data-test="new-photo">
            <image :src="p.preview" mode="aspectFill" class="img" />
            <text class="remove" data-test="new-photo-remove" @click="photos.splice(n, 1)">✕</text>
          </view>
          <view v-if="photos.length < CASE_RULES.maxPhotos" class="photo add" data-test="add-photo" @click="pick"><text>＋</text></view>
        </view>
      </view>
      <text class="note">Sending stops the 12 h auto-confirm. Our team reviews it, and payout for this order is on hold meanwhile.</text>
      <text v-if="error" class="error" data-test="error">{{ error }}</text>
      <text v-else-if="problem" class="hint" data-test="hint">{{ problem }}</text>
      <button class="primary" data-test="send-case" :disabled="!!problem || busy" @click="send">{{ busy ? 'Sending…' : 'Send' }}</button>
    </template>
    <text v-else-if="error" class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { CASE_KINDS, CASE_KIND_LABEL, CASE_RULES, CASE_STATUS_LABEL, caseProblem, klAtText, type CaseKind, type VisitCase } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { casePhotoUrl, getCase, getReport, raiseProblem } from '@/api/booking';
import { ApiError } from '@/api/client';
import { shrinkPhoto } from '@/photo-shrink';

/** O18 (E9-2, R40-3 … R40-6): raise a problem on a visit's report, then follow the case. */
const sent = ref<VisitCase | null>(null);
const ready = ref(false);
const error = ref('');
const busy = ref(false);
const kind = ref<CaseKind | ''>('');
const description = ref('');
const photos = ref<{ file: Blob; preview: string }[]>([]);
const urls = reactive<Record<number, string>>({});
const problem = computed(() => caseProblem({ kind: kind.value, description: description.value }));
let id = 0;
let index = 0;

function show(c: VisitCase) {
  sent.value = c;
  for (const pid of c.photos) {
    if (!urls[pid]) casePhotoUrl(id, index, pid).then((u) => (urls[pid] = u)).catch(() => undefined);
  }
}

async function load() {
  error.value = '';
  try {
    show(await getCase(id, index));
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'CASE_NOT_FOUND') {
      error.value = (e as Error).message;
      return;
    }
    // R40-5: only while the report waits for the owner.
    try {
      const r = await getReport(id, index);
      if (r.status === 'report_sent') ready.value = true;
      else error.value = 'This visit is already confirmed. For help, use WhatsApp support.';
    } catch (e2) {
      error.value = (e2 as Error).message;
    }
  }
}

function pick() {
  uni.chooseImage({
    count: CASE_RULES.maxPhotos - photos.value.length,
    sourceType: ['camera', 'album'],
    success: async (res) => {
      for (const f of res.tempFiles as File[]) {
        if (photos.value.length < CASE_RULES.maxPhotos) photos.value.push({ file: await shrinkPhoto(f), preview: URL.createObjectURL(f) });
      }
    },
  });
}

async function send() {
  if (problem.value) return;
  busy.value = true;
  error.value = '';
  try {
    show(await raiseProblem(id, index, { kind: kind.value, description: description.value }, photos.value.map((p) => p.file)));
    uni.showToast({ title: 'Problem sent', icon: 'success' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/orders/problem?id=${id}&i=${index}`))) return;
  if (!sent.value) await load();
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; }
.section { font-weight: 700; font-size: 30rpx; }
.body { font-size: 28rpx; line-height: 1.5; white-space: pre-wrap; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.right { text-align: right; }
.hint { display: block; text-align: center; color: var(--pp-muted); font-size: 24rpx; }
.error { color: var(--pp-danger); }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-danger); }
.kinds { display: flex; flex-wrap: wrap; gap: 16rpx; }
.kind { padding: 14rpx 28rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; font-size: 28rpx; }
.kind.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.textarea { width: 100%; height: 220rpx; padding: 16rpx; box-sizing: border-box; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.photos { display: flex; flex-wrap: wrap; gap: 16rpx; }
.photo { position: relative; width: 196rpx; height: 196rpx; border-radius: 12rpx; overflow: hidden; background: var(--pp-background); }
.photo.add { display: flex; align-items: center; justify-content: center; border: 2px dashed var(--pp-border); font-size: 56rpx; color: var(--pp-muted); box-sizing: border-box; }
.img { width: 100%; height: 100%; }
.remove { position: absolute; top: 4rpx; right: 4rpx; width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center; border-radius: 50%; background: var(--pp-ink); color: var(--pp-surface); font-size: 24rpx; }
.steps { display: flex; flex-direction: column; gap: 8rpx; margin-top: 8rpx; }
.step { font-size: 26rpx; color: var(--pp-muted); }
.step.done { color: var(--pp-primary-strong); font-weight: 600; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
