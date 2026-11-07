<template>
  <view v-if="v" class="content">
    <view class="card">
      <view class="row">
        <text class="section">Photos (required)</text>
        <text class="note" data-test="photo-count">{{ photoCountText(v.photos.length) }}</text>
      </view>
      <VisitPhotos :order-id="id" :index="index" :photos="v.photos" @changed="show" @state="photoState = $event" @error="actionError = $event" />
    </view>

    <view class="card">
      <text class="section">What was done</text>
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
        <text class="section">Note</text>
        <text class="note" data-test="note-state">{{ noteState }}</text>
      </view>
      <textarea
        v-model="note"
        class="note-box"
        data-test="note"
        :maxlength="REPORT_RULES.noteMax"
        placeholder="How did it go? If something was not done, say why."
        @input="noteChanged"
      />
      <text class="note right">{{ note.length }}/{{ REPORT_RULES.noteMax }}</text>
    </view>

    <view v-if="blockers.length" class="card warn" data-test="problems">
      <text v-for="b in blockers" :key="b" class="line" data-test="problem">• {{ b }}</text>
    </view>
    <text v-if="actionError" class="error" data-test="action-error">{{ actionError }}</text>

    <button class="primary" data-test="send" :disabled="busy || blockers.length > 0" @click="send">{{ busy ? 'Sending…' : 'Send report' }}</button>
    <text class="note center" data-test="location-notice">📍 Your location is saved only when you tap I've arrived and now.</text>
    <text class="note center">After sending, the report is locked. The owner has {{ REPORT_RULES.confirmHours }} h to check it.</text>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { CHECK_LABEL, REPORT_RULES, photoCountText, reportProblems, type CheckItem, type VisitTask } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { checkItem, getVisit, saveReportNote, sendReport } from '@/api/requests';
import VisitPhotos from '@/components/VisitPhotos.vue';
import { currentLocation } from '@/location';

const v = ref<VisitTask | null>(null);
const error = ref('');
const actionError = ref('');
const busy = ref(false);
const photoState = ref<'none' | 'uploading' | 'failed'>('none');
const note = ref('');
const noteState = ref('');
const id = ref(0);
const index = ref(0);
let noteTimer: ReturnType<typeof setTimeout> | undefined;

/** R37-1, R37-3: what still stops sending; failed or uploading photos block it too. */
const blockers = computed(() => {
  if (!v.value) return [];
  const out = reportProblems({ ...v.value, note: note.value });
  if (photoState.value === 'failed') out.push('A photo failed to upload. Tap ↻ to try again, or remove it');
  else if (photoState.value === 'uploading') out.push('Waiting for photos to upload');
  return out;
});

function show(next: VisitTask, keepNote = true) {
  v.value = next;
  if (!keepNote) note.value = next.note;
}

async function load() {
  try {
    const next = await getVisit(id.value, index.value);
    if (next.status !== 'in_service') {
      uni.redirectTo({ url: `/pages/caregiver/visit?id=${id.value}&i=${index.value}` });
      return;
    }
    show(next, false);
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

const toggle = (item: CheckItem, done: boolean) => act(() => checkItem(id.value, index.value, item, done));

/** R37-2: saved as a draft shortly after typing stops. */
function noteChanged() {
  noteState.value = 'Saving…';
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => void saveNote(), 800);
}

async function saveNote() {
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = undefined;
  try {
    show(await saveReportNote(id.value, index.value, note.value));
    noteState.value = 'Draft saved';
  } catch (e) {
    noteState.value = '';
    actionError.value = (e as Error).message;
  }
}

/** R37-4, R37-6 */
async function send() {
  busy.value = true;
  actionError.value = '';
  try {
    if (note.value !== v.value!.note) await saveNote();
    await sendReport(id.value, index.value, await currentLocation());
    uni.showToast({ title: 'Report sent', icon: 'success' });
    uni.redirectTo({ url: `/pages/caregiver/visit?id=${id.value}&i=${index.value}` });
  } catch (e) {
    actionError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

onLoad((q) => {
  id.value = Number(q?.id) || 0;
  index.value = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/caregiver/report?id=${id.value}&i=${index.value}`))) return;
  await load();
});
onUnload(() => {
  if (noteTimer) void saveNote();
});
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card.warn { border-color: var(--pp-danger); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; gap: 16rpx; }
.section { font-weight: 700; font-size: 30rpx; }
.line { font-size: 26rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.right { text-align: right; }
.tick { display: flex; align-items: center; gap: 16rpx; font-size: 28rpx; padding: 10rpx 0; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.note-box { width: 100%; height: 180rpx; box-sizing: border-box; padding: 16rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.error { color: var(--pp-danger); }
</style>
