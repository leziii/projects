<template>
  <view v-if="loaded" class="content">
    <view class="card">
      <text class="section">How does the caregiver get in?</text>
      <view v-for="m in ENTRY_METHODS" :key="m" class="option" :class="{ on: form.method === m }" :data-test="`method-${m}`" @click="form.method = m">
        <text class="strong">{{ form.method === m ? '◉' : '○' }} {{ ENTRY_METHOD_LABEL[m].title }}</text>
        <text class="muted">{{ ENTRY_METHOD_LABEL[m].help }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">Instructions</text>
      <text class="label">Key or lock{{ form.method === 'pre_authorised' ? ' (required)' : '' }}</text>
      <textarea v-model="form.keyLock" class="textarea" data-test="key-lock" :maxlength="ENTRY_TEXT_MAX" placeholder="e.g. Door code 4821#, or key with the guard" />
      <text class="label">Guard or reception</text>
      <textarea v-model="form.guard" class="textarea" data-test="guard" :maxlength="ENTRY_TEXT_MAX" placeholder="e.g. Guard has been told, show the PawPal app" />
      <text class="label">Other notes</text>
      <textarea v-model="form.notes" class="textarea" data-test="notes" :maxlength="ENTRY_TEXT_MAX" placeholder="e.g. Cat hides under the bed" />
      <text class="muted" data-test="privacy">🔒 Only you can see this now. Your caregiver sees it only after accepting. It never appears in messages or notifications.</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="primary" data-test="save-entry" :disabled="busy" @click="save">Save</button>
    <button v-if="saved" class="primary next" data-test="to-confirm" @click="toConfirm">Next: confirm and pay</button>
    <text class="hint" data-test="entry-hint">{{ saved ? 'Saved. Next: check everything and pay.' : 'Save to continue.' }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { EMPTY_ENTRY, ENTRY_METHODS, ENTRY_METHOD_LABEL, ENTRY_TEXT_MAX, type EntryInfo } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getDraft, saveEntry } from '@/api/booking';
import { CONFIRM_URL } from '@/booking';
import { settleInputs } from '@/inputs';

const form = ref<EntryInfo>({ ...EMPTY_ENTRY });
const loaded = ref(false);
const saved = ref(false);
const busy = ref(false);
const error = ref('');

onShow(async () => {
  if (!(await requireUser('/pages/booking/entry'))) return;
  const d = await getDraft();
  form.value = { ...(d.entry ?? EMPTY_ENTRY) };
  saved.value = !!d.entry;
  loaded.value = true;
});

async function save() {
  error.value = '';
  busy.value = true;
  try {
    await settleInputs();
    const d = await saveEntry(form.value);
    form.value = { ...d.entry! };
    saved.value = true;
    uni.showToast({ title: 'Saved', icon: 'none' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function toConfirm() {
  uni.navigateTo({ url: CONFIRM_URL });
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.option { display: flex; flex-direction: column; gap: 4rpx; padding: 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; }
.option.on { border-color: var(--pp-primary-strong); background: var(--pp-background); }
.label { font-weight: 600; font-size: 26rpx; margin-top: 8rpx; }
.textarea { width: auto; height: 140rpx; padding: 16rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.hint { display: block; text-align: center; color: var(--pp-muted); font-size: 26rpx; margin-top: 16rpx; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; margin-bottom: 12rpx; }
.next { margin-top: 20rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
