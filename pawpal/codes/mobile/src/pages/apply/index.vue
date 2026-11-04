<template>
  <view v-if="app" class="content">
    <view v-if="app.status === 'needs_info' || app.status === 'rejected'" class="card notice" data-test="review-note">
      <text class="strong">{{ app.status === 'needs_info' ? 'We need more information' : 'Not approved' }}</text>
      <text v-if="app.adminNote" class="muted" data-test="admin-note">{{ app.adminNote }}</text>
      <text class="muted">Fix the items below and submit again.</text>
    </view>

    <view class="card">
      <text class="section">① Identity</text>
      <text class="label">Full name as on your IC</text>
      <input v-model="form.fullName" class="input" data-test="full-name" :disabled="!editable" placeholder="e.g. Siti Aminah binti Ahmad" :maxlength="APPLICATION_RULES.nameMax">
      <text class="label">IC number</text>
      <input v-if="editable" v-model="form.icNumber" class="input" data-test="ic" placeholder="e.g. 900101145678" :maxlength="14">
      <text v-else class="value" data-test="ic-masked">{{ maskIc(app.icNumber) }}</text>
      <text class="muted">Malaysian IC only for now. Your IC number and photos are private: only PawPal staff can see them.</text>
      <view v-for="kind in ID_FILES" :key="kind" class="slot">
        <text class="label">{{ APPLICATION_FILE_LABEL[kind] }}</text>
        <ApplyPhotos :kind="kind" :files="app.files" :thumbs="thumbs" :editable="editable" @add="pick" @remove="remove" />
      </view>
    </view>

    <view class="card">
      <text class="section">② Experience</text>
      <text class="label">Years of pet care experience</text>
      <input v-model="form.years" class="input" data-test="years" type="number" :disabled="!editable" placeholder="e.g. 3">
      <text class="label">I can care for</text>
      <view class="choices">
        <text class="choice" :class="{ on: form.cats }" data-test="cats" @click="editable && (form.cats = !form.cats)">🐱 Cats</text>
        <text class="choice" :class="{ on: form.dogs }" data-test="dogs" @click="editable && (form.dogs = !form.dogs)">🐶 Dogs</text>
      </view>
      <template v-if="form.dogs">
        <text class="label">Largest dog I can handle</text>
        <view class="choices wrap">
          <text v-for="s in DOG_SIZES" :key="s" class="choice" :class="{ on: form.maxDogSize === s }" :data-test="`size-${s}`" @click="editable && (form.maxDogSize = s)">{{ DOG_SIZE_LABEL[s] }}</text>
        </view>
      </template>
    </view>

    <view class="card">
      <text class="section">③ Certificates (optional)</text>
      <text class="muted">Uploaded certificates are checked by PawPal; they do not approve you on their own.</text>
      <view v-for="kind in OPTIONAL_FILES" :key="kind" class="slot">
        <text class="label">{{ APPLICATION_FILE_LABEL[kind] }}{{ FILE_LIMIT[kind] > 1 ? ` (up to ${FILE_LIMIT[kind]})` : '' }}</text>
        <ApplyPhotos :kind="kind" :files="app.files" :thumbs="thumbs" :editable="editable" @add="pick" @remove="remove" />
      </view>
    </view>

    <view class="card">
      <text class="section">④ Areas and care guide</text>
      <text class="label">Areas I can work in</text>
      <view class="choices wrap">
        <text v-for="a in AREAS" :key="a" class="choice small" :class="{ on: form.areas.includes(a) }" :data-test="`area-${a}`" @click="editable && (form.areas = toggleArea(form.areas, a))">{{ a }}</text>
      </view>
      <text class="label">Care guide</text>
      <text class="link" data-test="open-guide" @click="openGuide">Read the PawPal care guide ›</text>
      <view class="confirm" data-test="guide-read" role="checkbox" :aria-checked="form.guideRead" @click="tickGuide">
        <view class="box" :class="{ on: form.guideRead }">{{ form.guideRead ? '✓' : '' }}</view>
        <text>I have read the care guide</text>
      </view>
    </view>

    <template v-if="editable">
      <view v-if="problems.length" class="card missing" data-test="missing">
        <text class="strong">Still needed to submit</text>
        <text v-for="p in problems" :key="p" class="muted">· {{ p }}</text>
      </view>
      <text v-if="error" class="error" data-test="error">{{ error }}</text>
      <view class="buttons">
        <button class="secondary" data-test="save-draft" :disabled="busy" @click="saveDraft">Save draft</button>
        <button class="primary" data-test="submit" :disabled="!!problems.length || busy" @click="submit">Submit application</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import {
  APPLICATION_FILE_LABEL,
  APPLICATION_RULES,
  AREAS,
  DOG_SIZES,
  DOG_SIZE_LABEL,
  FILE_LIMIT,
  maskIc,
  type Application,
  type ApplicationFileKind,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import ApplyPhotos from '@/components/ApplyPhotos.vue';
import { applicationFileUrl, getApplication, removeApplicationFile, saveApplication, submitApplication, uploadApplicationFile } from '@/api/apply';
import { applicationToForm, applyFormToInput, applyProblems, canEdit, emptyApplyForm, toggleArea } from '@/apply';
import { settleInputs } from '@/inputs';
import { photoProblem } from '@/pets';

const ID_FILES: ApplicationFileKind[] = ['ic_front', 'ic_back', 'selfie'];
const OPTIONAL_FILES: ApplicationFileKind[] = ['certificate', 'good_conduct'];
const now = new Date();

const app = ref<Application | null>(null);
const form = ref(emptyApplyForm());
const busy = ref(false);
const error = ref('');
const thumbs = ref<Record<number, string>>({});
const guideOpened = ref(false);

const editable = computed(() => !!app.value && canEdit(app.value));
const problems = computed(() => applyProblems(form.value, app.value?.files ?? [], now));

onLoad(async () => {
  if (!(await requireUser('/pages/apply/index'))) return;
  const a = await getApplication();
  // A sent application is shown on the status page (S03); the form opens only to edit.
  if (!canEdit(a)) {
    uni.redirectTo({ url: '/pages/apply/status' });
    return;
  }
  show(a, true);
  uni.$on('care-guide-read', onGuideRead);
});
onUnload(() => {
  uni.$off('care-guide-read', onGuideRead);
  Object.values(thumbs.value).forEach((u) => URL.revokeObjectURL(u));
});

function onGuideRead() {
  guideOpened.value = true;
  form.value.guideRead = true;
}

/** Shows the server's copy; the form is replaced only on first load or after saving, so typing is never lost. */
function show(a: Application, withForm: boolean) {
  app.value = a;
  if (withForm) form.value = applicationToForm(a);
  for (const f of a.files) {
    if (!thumbs.value[f.id]) applicationFileUrl(f.id).then((u) => (thumbs.value = { ...thumbs.value, [f.id]: u })).catch(() => {});
  }
}

function openGuide() {
  uni.navigateTo({ url: '/pages/apply/guide' });
}

/** The box can be cleared any time, but ticking it needs the guide opened first. */
function tickGuide() {
  if (!editable.value) return;
  if (form.value.guideRead) form.value.guideRead = false;
  else if (guideOpened.value || app.value?.guideRead) form.value.guideRead = true;
  else openGuide();
}

function pick(kind: ApplicationFileKind) {
  uni.chooseImage({ count: 1, sourceType: ['album', 'camera'], success: (res) => upload(kind, (res.tempFiles as File[])[0]) });
}

async function upload(kind: ApplicationFileKind, file: File | undefined) {
  if (!file) return;
  error.value = photoProblem(file);
  if (error.value) return;
  busy.value = true;
  try {
    show(await uploadApplicationFile(kind, file), false);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove(id: number) {
  busy.value = true;
  try {
    show(await removeApplicationFile(id), false);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function save(): Promise<Application> {
  await settleInputs();
  const saved = await saveApplication(applyFormToInput(form.value));
  show(saved, true);
  return saved;
}

async function saveDraft() {
  error.value = '';
  busy.value = true;
  try {
    await save();
    uni.showToast({ title: 'Draft saved', icon: 'none' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await save();
    if (problems.value.length) return;
    await submitApplication();
    uni.showToast({ title: 'Application submitted', icon: 'none' });
    // Back to the status page if we came from it (it reloads on show); otherwise open it in place of the form.
    const pages = getCurrentPages();
    if (pages.length > 1 && pages[pages.length - 2].route === 'pages/apply/status') uni.navigateBack();
    else uni.redirectTo({ url: '/pages/apply/status' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.content { padding: 32rpx; }
.card { margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.notice, .missing { display: flex; flex-direction: column; gap: 6rpx; border-color: var(--pp-accent); }
.strong { font-weight: 700; }
.section { display: block; font-weight: 700; font-size: 30rpx; }
.label { display: block; font-weight: 600; font-size: 26rpx; margin: 24rpx 0 10rpx; }
.value { display: block; font-size: 30rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; margin-top: 10rpx; }
.choices { display: flex; gap: 16rpx; align-items: center; }
.choices.wrap { flex-wrap: wrap; }
.choice { padding: 14rpx 32rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; }
.choice.small { padding: 10rpx 24rpx; font-size: 26rpx; }
.choice.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.input { height: 88rpx; margin-top: 12rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; background: var(--pp-surface); color: var(--pp-ink); }
.link { display: block; color: var(--pp-primary-strong); font-weight: 600; }
.confirm { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx; font-size: 26rpx; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.error { display: block; margin-bottom: 16rpx; color: var(--pp-danger); font-size: 26rpx; }
.buttons { display: flex; gap: 20rpx; }
.buttons button { flex: 1; font-size: 28rpx; }
.secondary { background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
