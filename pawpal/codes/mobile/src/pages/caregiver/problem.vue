<template>
  <view v-if="v" class="content">
    <view class="card">
      <text class="section">Visit {{ index + 1 }} · {{ v.number }}</text>
      <text class="note">{{ dayText(v.date) }} · {{ taskTime(v) }}</text>
    </view>

    <!-- R49-4: the report once sent -->
    <template v-if="report">
      <view class="card" data-test="report">
        <text class="section" data-test="report-kind">{{ PROBLEM_KIND_LABEL[report.kind] }}</text>
        <text class="line" data-test="report-description">{{ report.description }}</text>
        <text class="note">Sent {{ klAtText(report.createdAt) }}</text>
      </view>

      <view class="card">
        <text class="section">Photos</text>
        <view class="photos">
          <view v-for="pid in report.photos" :key="pid" class="photo" data-test="report-photo">
            <image v-if="urls[pid]" :src="urls[pid]" mode="aspectFill" class="img" />
          </view>
          <view v-if="open && report.photos.length < PROBLEM_RULES.maxPhotos" class="photo add" data-test="report-photo-add" @click="pickMore">
            <text>{{ uploading ? 'Uploading…' : '+ Photo' }}</text>
          </view>
        </view>
        <text class="note">{{ report.photos.length }} of {{ PROBLEM_RULES.maxPhotos }} photos</text>
      </view>

      <view class="card">
        <text class="section">Contact log</text>
        <text v-for="c in report.contacts" :key="c.id" class="line" data-test="contact-line">{{ contactText(c, atTime) }}</text>
        <text v-if="!report.contacts.length" class="note">No tries noted</text>
        <ContactPicker v-if="open" v-model:method="method" v-model:note="note" />
        <button v-if="open" class="ghost" data-test="add-contact" :disabled="busy" @click="addContact">Add a contact try</button>
      </view>

      <view class="card" data-test="platform">
        <text class="section">What happens next</text>
        <view class="row"><text class="note">Status</text><text class="strong" data-test="report-status">{{ PROBLEM_STATUS_LABEL[report.status] }}</text></view>
        <view v-if="report.decision" class="decided"><text class="note">Decision</text><text class="strong" data-test="report-decision">{{ report.decision }}</text></view>
        <view v-else class="row"><text class="note">Decision</text><text class="strong" data-test="report-decision">—</text></view>
        <text class="note">You cannot decide who is at fault or take money; our team decides.</text>
      </view>
    </template>

    <!-- R49-2, R49-3: the form -->
    <template v-else-if="kinds.length">
      <view class="card">
        <text class="section">What went wrong?</text>
        <view v-for="k in kinds" :key="k" class="choice" :class="{ on: kind === k }" :data-test="`kind-${k}`" @click="kind = k">
          <text class="strong">{{ kind === k ? '◉' : '○' }} {{ PROBLEM_KIND_LABEL[k] }}</text>
        </view>
      </view>

      <view class="card">
        <text class="section">Describe it</text>
        <textarea v-model="description" class="field area" data-test="description" :maxlength="PROBLEM_RULES.descriptionMax" placeholder="What happened, and what you did" />
        <text class="note right">{{ description.length }} / {{ PROBLEM_RULES.descriptionMax }}</text>
      </view>

      <view class="card">
        <text class="section">Photos (optional)</text>
        <view class="photos">
          <view v-for="p in picked" :key="p.preview" class="photo" data-test="picked-photo">
            <image :src="p.preview" mode="aspectFill" class="img" />
            <text class="remove" @click="unpick(p.preview)">✕</text>
          </view>
          <view v-if="picked.length < PROBLEM_RULES.maxPhotos" class="photo add" data-test="photo-add" @click="pick">
            <text>+ Photo</text>
          </view>
        </view>
      </view>

      <view class="card">
        <text class="section">Contact log</text>
        <text v-for="(c, n) in tries" :key="n" class="line" data-test="contact-line">{{ contactText(c, atTime) }}</text>
        <ContactPicker v-model:method="method" v-model:note="note" />
        <button class="ghost" data-test="add-contact" @click="noteTry">Add a contact try</button>
      </view>

      <text class="note center">You cannot decide who is at fault or take money; our team decides.</text>
      <text v-if="formProblem" class="note center" data-test="form-problem">{{ formProblem }}</text>
      <button class="primary" data-test="send-problem" :disabled="busy || !!formProblem" @click="send">Send report</button>
    </template>

    <view v-else class="card" data-test="cannot-report">
      <text class="note">Problems can be reported from acceptance until the report is sent. For help, use WhatsApp below.</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <view class="card"><HelpButton :order-no="v.number" label="Help with this visit" /></view>
    <button class="ghost" data-test="back-to-visit" @click="back">Back</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  PROBLEM_KIND_LABEL,
  PROBLEM_RULES,
  PROBLEM_STATUS_LABEL,
  contactText,
  dayText,
  klAtText,
  minuteOfDay,
  problemKindsFor,
  problemProblem,
  taskTime,
  timeText,
  type ContactMethod,
  type ProblemKind,
  type ProblemReport,
  type VisitTask,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { addProblemContact, getProblem, getVisit, problemPhotoUrl, sendProblem, uploadProblemPhoto } from '@/api/requests';
import HelpButton from '@/components/HelpButton.vue';
import ContactPicker from '@/components/ContactPicker.vue';
import { shrinkPhoto } from '@/photo-shrink';

/** E12-1 S13 (round 49): the caregiver reports a problem with photos and a contact log; our team decides. */
const v = ref<VisitTask | null>(null);
const report = ref<ProblemReport | null>(null);
const error = ref('');
const busy = ref(false);
const uploading = ref(false);
const kind = ref<ProblemKind | null>(null);
const description = ref('');
const method = ref<ContactMethod>('called');
const note = ref('');
const tries = ref<{ method: ContactMethod; note: string; at: string }[]>([]);
const picked = ref<{ file: File; preview: string }[]>([]);
const urls = reactive<Record<number, string>>({});
let id = 0;
let index = 0;

const kinds = computed(() => (v.value ? problemKindsFor(v.value.status) : []));
const open = computed(() => !!report.value && report.value.status !== 'decided');
const formProblem = computed(() => (v.value ? problemProblem({ kind: kind.value, description: description.value }, v.value.status) : ''));

/** KL "YYYY-MM-DD HH:MM:SS" or an ISO time → "6:02 pm". */
const atTime = (at: string) => (at.includes('T') ? timeText(minuteOfDay(new Date(Date.parse(at) + 8 * 3_600_000).toISOString().replace('T', ' '))) : timeText(minuteOfDay(at)));

watch(
  () => report.value?.photos ?? [],
  (ids) => {
    for (const p of ids) if (!urls[p]) problemPhotoUrl(id, index, p).then((u) => (urls[p] = u)).catch(() => undefined);
  },
);

async function load() {
  try {
    v.value = await getVisit(id, index);
    report.value = (await getProblem(id, index)).report;
    if (!kind.value && kinds.value.length === 1) kind.value = kinds.value[0];
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onLoad((q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
});
onShow(async () => {
  if (!(await requireUser(`/pages/caregiver/problem?id=${id}&i=${index}`))) return;
  await load();
});

/** R49-3: noted now; sent with the report. */
function noteTry() {
  tries.value.push({ method: method.value, note: note.value.trim().slice(0, PROBLEM_RULES.noteMax), at: new Date().toISOString() });
  note.value = '';
}

function pick() {
  const room = PROBLEM_RULES.maxPhotos - picked.value.length;
  if (room > 0) uni.chooseImage({ count: room, sourceType: ['camera', 'album'], success: (res) => {
    for (const f of (res.tempFiles as File[]).slice(0, room)) picked.value.push({ file: f, preview: URL.createObjectURL(f) });
  } });
}

function unpick(preview: string) {
  picked.value = picked.value.filter((p) => p.preview !== preview);
  URL.revokeObjectURL(preview);
}

async function send() {
  if (!kind.value) return;
  busy.value = true;
  error.value = '';
  try {
    report.value = await sendProblem(id, index, { kind: kind.value, description: description.value.trim(), contacts: tries.value });
    await uploadAll(picked.value.map((p) => p.file));
    picked.value = [];
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function uploadAll(files: File[]) {
  uploading.value = true;
  try {
    for (const f of files) report.value = await uploadProblemPhoto(id, index, await shrinkPhoto(f));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    uploading.value = false;
  }
}

function pickMore() {
  if (uploading.value || !report.value) return;
  const room = PROBLEM_RULES.maxPhotos - report.value.photos.length;
  if (room > 0) uni.chooseImage({ count: room, sourceType: ['camera', 'album'], success: (res) => void uploadAll((res.tempFiles as File[]).slice(0, room)) });
}

async function addContact() {
  busy.value = true;
  error.value = '';
  try {
    report.value = await addProblemContact(id, index, method.value, note.value.trim());
    note.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const back = () => (getCurrentPages().length > 1 ? uni.navigateBack() : uni.redirectTo({ url: `/pages/caregiver/visit?id=${id}&i=${index}` }));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; }
.right { text-align: right; }
.row { display: flex; justify-content: space-between; align-items: center; }
.decided { display: flex; flex-direction: column; gap: 6rpx; line-height: 1.5; }
.choice { padding: 16rpx; border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.choice.on { border: 2px solid var(--pp-primary-strong); background: var(--pp-background); }
.field { border: 1px solid var(--pp-border); border-radius: 12rpx; padding: 16rpx; font-size: 28rpx; background: var(--pp-surface); }
.area { width: auto; height: 200rpx; }
.photos { display: flex; flex-wrap: wrap; gap: 16rpx; }
.photo { position: relative; width: 196rpx; height: 196rpx; border-radius: 12rpx; overflow: hidden; background: var(--pp-background); box-sizing: border-box; }
.photo.add { display: flex; align-items: center; justify-content: center; border: 1px dashed var(--pp-border); color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.img { width: 100%; height: 100%; }
.remove { position: absolute; top: 6rpx; right: 6rpx; width: 44rpx; height: 44rpx; border-radius: 50%; background: var(--pp-ink); color: var(--pp-surface); font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
