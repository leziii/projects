<template>
  <view v-if="ready" class="content">
    <view v-if="pet && pet.status !== 'approved'" class="card notice" data-test="pet-check">
      <text class="strong">{{ PET_STATUS_LABEL[pet.status] }}</text>
      <text v-if="pet.checkReasons.length" class="muted">{{ pet.checkReasons.map((r) => CHECK_REASON_LABEL[r]).join(' · ') }}</text>
      <text v-if="pet.adminNote" class="muted" data-test="edit-admin-note">{{ pet.adminNote }}</text>
    </view>

    <view class="card">
      <text class="section">Basic info</text>
      <text class="label">Type</text>
      <view class="choices">
        <text v-for="k in KINDS" :key="k" class="choice" :class="{ on: form.kind === k }" :data-test="`kind-${k}`" @click="form.kind = k">
          {{ PET_ICON[k] }} {{ k === 'cat' ? 'Cat' : 'Dog' }}
        </text>
      </view>

      <text class="label">Name</text>
      <input v-model="form.name" class="input" data-test="name" placeholder="e.g. Mimi" :maxlength="PET_RULES.nameMax">

      <text class="label">Born</text>
      <view class="row">
        <select v-model="form.birthMonth" class="select" data-test="birth-month">
          <option value="">Month</option>
          <option v-for="(m, i) in MONTHS" :key="m" :value="String(i + 1)">{{ m }}</option>
        </select>
        <select v-model="form.birthYear" class="select" data-test="birth-year">
          <option value="">Year</option>
          <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
        </select>
      </view>

      <template v-if="form.kind === 'dog'">
        <text class="label">Breed</text>
        <select v-model="form.breedChoice" class="select wide" data-test="breed">
          <option value="">Choose breed</option>
          <option v-for="b in BREED_OPTIONS" :key="b" :value="b">{{ b }}</option>
        </select>
        <input v-if="form.breedChoice === OTHER_BREED" v-model="form.breedOther" class="input" data-test="breed-other" placeholder="Type the breed" :maxlength="PET_RULES.breedMax">

        <text class="label">Weight (kg)</text>
        <input v-model="form.weight" class="input" data-test="weight" type="digit" placeholder="e.g. 12">
      </template>
    </view>

    <view class="card">
      <text class="section">Health</text>
      <text class="label">Vaccinated?</text>
      <view class="choices">
        <text class="choice" :class="{ on: form.vaccinated === 'yes' }" data-test="vaccinated-yes" @click="form.vaccinated = 'yes'">Yes</text>
        <text class="choice" :class="{ on: form.vaccinated === 'no' }" data-test="vaccinated-no" @click="form.vaccinated = 'no'">No</text>
      </view>

      <template v-if="form.vaccinated === 'yes'">
        <text class="label">Last vaccination</text>
        <view class="row">
          <select v-model="form.vaccineMonth" class="select" data-test="vaccine-month">
            <option value="">Month</option>
            <option v-for="(m, i) in MONTHS" :key="m" :value="String(i + 1)">{{ m }}</option>
          </select>
          <select v-model="form.vaccineYear" class="select" data-test="vaccine-year">
            <option value="">Year</option>
            <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
          </select>
        </view>

        <text class="label">Vaccine card photo (optional)</text>
        <view class="row">
          <text class="ghost-btn" data-test="vaccine-photo" @click="pickPhoto">{{ photoFile || pet?.hasVaccinePhoto ? 'Change photo' : 'Choose photo' }}</text>
          <text v-if="pet?.hasVaccinePhoto && !photoFile" class="link" data-test="view-photo" @click="showPhoto">View card</text>
        </view>
        <image v-if="preview" class="preview" :src="preview" mode="aspectFit" data-test="photo-preview" />
        <text class="muted">A record from the last 12 months counts. Older records or no vaccine → we check the pet first.</text>
      </template>

      <text class="label">Health notes (optional)</text>
      <textarea v-model="form.healthNote" class="textarea" data-test="health-note" placeholder="Illness, medicine, special diet…" :maxlength="PET_RULES.noteMax" />
    </view>

    <view class="confirm" data-test="confirm" role="checkbox" :aria-checked="form.confirmed" @click="form.confirmed = !form.confirmed">
      <view class="box" :class="{ on: form.confirmed }">{{ form.confirmed ? '✓' : '' }}</view>
      <text>I confirm this information is true</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <text v-else-if="problem" class="muted hint" data-test="hint">{{ problem }}</text>

    <button class="primary" data-test="save" :disabled="!!problem || busy" @click="save">Save</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { CHECK_REASON_LABEL, OTHER_BREED, PET_RULES, PET_STATUS_LABEL, type Pet } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { createPet, getPet, updatePet, uploadVaccinePhoto, vaccinePhotoUrl } from '@/api/pets';
import { settleInputs } from '@/inputs';
import { BREED_OPTIONS, MONTHS, PET_ICON, emptyForm, formProblem, formToInput, petToForm, photoProblem, savedNote, yearOptions } from '@/pets';

const KINDS = ['cat', 'dog'] as const;
const now = new Date();
const years = yearOptions(now);
const form = ref(emptyForm());
const pet = ref<Pet | null>(null);
const ready = ref(false);
const busy = ref(false);
const error = ref('');
const photoFile = ref<File | null>(null);
const preview = ref('');

const problem = computed(() => formProblem(form.value, now));

onLoad(async (query) => {
  const id = Number(query?.id);
  if (!(await requireUser(id ? `/pages/pets/edit?id=${id}` : '/pages/pets/edit'))) return;
  if (id) {
    pet.value = await getPet(id);
    form.value = petToForm(pet.value);
    uni.setNavigationBarTitle({ title: pet.value.name });
  }
  ready.value = true;
});

function setPreview(url: string) {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = url;
}
onUnload(() => setPreview(''));

function pickPhoto() {
  uni.chooseImage({ count: 1, sourceType: ['album', 'camera'], success: (res) => usePhoto((res.tempFiles as File[])[0]) });
}

/** In the web app chooseImage hands back the browser File. */
function usePhoto(file: File | undefined) {
  if (!file) return;
  const bad = photoProblem(file);
  if (bad) {
    error.value = bad;
    return;
  }
  error.value = '';
  photoFile.value = file;
  setPreview(URL.createObjectURL(file));
}

async function showPhoto() {
  if (pet.value) setPreview(await vaccinePhotoUrl(pet.value.id));
}

async function save() {
  error.value = '';
  busy.value = true;
  try {
    await settleInputs();
    if (problem.value) return;
    const input = formToInput(form.value);
    let saved = pet.value ? await updatePet(pet.value.id, input) : await createPet(input);
    if (photoFile.value && form.value.vaccinated === 'yes') saved = await uploadVaccinePhoto(saved.id, photoFile.value);
    uni.showToast({ title: savedNote(saved), icon: 'none' });
    uni.navigateBack();
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
.notice { display: flex; flex-direction: column; gap: 6rpx; border-color: var(--pp-accent); }
.strong { font-weight: 700; }
.section { display: block; font-weight: 700; font-size: 30rpx; }
.label { display: block; font-weight: 600; font-size: 26rpx; margin: 24rpx 0 10rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; margin-top: 10rpx; }
.choices, .row { display: flex; gap: 16rpx; align-items: center; }
.choice { padding: 14rpx 32rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; }
.choice.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.input, .select { height: 88rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; background: var(--pp-surface); color: var(--pp-ink); }
.input { margin-top: 12rpx; }
.select { flex: 1; font-family: inherit; }
.select.wide { width: 100%; }
.textarea { width: auto; height: 160rpx; padding: 16rpx 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.ghost-btn { padding: 14rpx 28rpx; border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); color: var(--pp-primary-strong); font-size: 26rpx; }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.preview { width: 100%; height: 320rpx; margin-top: 16rpx; border-radius: 12rpx; background: var(--pp-background); }
.confirm { display: flex; align-items: center; gap: 16rpx; margin: 8rpx 0 16rpx; font-size: 26rpx; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.hint { text-align: center; }
.primary { margin-top: 16rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
