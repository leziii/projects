<template>
  <view v-if="ready" class="content">
    <view class="card">
      <text class="section">Address</text>
      <text class="label">Name</text>
      <input v-model="form.label" class="input" data-test="label" placeholder="e.g. Home, Office" :maxlength="ADDRESS_RULES.labelMax">
      <text class="label">Area</text>
      <select v-model="form.area" class="select" data-test="area">
        <option value="">Choose area</option>
        <option v-for="a in AREAS" :key="a" :value="a">{{ a }}</option>
      </select>
      <text class="label">Street</text>
      <input v-model="form.street" class="input" data-test="street" placeholder="e.g. Jalan Kiara 3, Condo name" :maxlength="ADDRESS_RULES.streetMax">
      <view class="row">
        <view class="col">
          <text class="label">Unit / house no.</text>
          <input v-model="form.unit" class="input" data-test="unit" placeholder="e.g. A-12-3" :maxlength="ADDRESS_RULES.unitMax">
        </view>
        <view class="col">
          <text class="label">Postcode</text>
          <input v-model="form.postcode" class="input" data-test="postcode" type="number" placeholder="50480" maxlength="5">
        </view>
      </view>
    </view>

    <view class="card">
      <text class="section">Contact at this address</text>
      <text class="label">Name</text>
      <input v-model="form.contactName" class="input" data-test="contact-name" :maxlength="ADDRESS_RULES.nameMax">
      <text class="label">Mobile</text>
      <input v-model="form.contactPhone" class="input" data-test="contact-phone" type="tel" placeholder="012-345 6789">
      <text class="label">Emergency contact (optional)</text>
      <input v-model="form.emergencyName" class="input" data-test="emergency-name" placeholder="Name" :maxlength="ADDRESS_RULES.nameMax">
      <input v-model="form.emergencyPhone" class="input" data-test="emergency-phone" type="tel" placeholder="Mobile">
    </view>

    <text class="note">Gate or door instructions are asked when you book, not saved here.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <text v-else-if="problem" class="hint" data-test="hint">{{ problem }}</text>
    <button class="primary" data-test="save" :disabled="!!problem || busy" @click="save">Save</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ADDRESS_RULES, AREAS } from '@pawpal/shared';
import { createAddress, getAddress, updateAddress } from '@/api/addresses';
import { requireUser } from '@/api/auth';
import { addressProblem, addressToForm, emptyAddress } from '@/addresses';
import { settleInputs } from '@/inputs';

const form = ref(emptyAddress());
const id = ref(0);
const ready = ref(false);
const busy = ref(false);
const error = ref('');
const problem = computed(() => addressProblem(form.value));

onLoad(async (query) => {
  id.value = Number(query?.id) || 0;
  if (!(await requireUser(id.value ? `/pages/addresses/edit?id=${id.value}` : '/pages/addresses/edit'))) return;
  if (id.value) form.value = addressToForm(await getAddress(id.value));
  ready.value = true;
});

async function save() {
  error.value = '';
  busy.value = true;
  try {
    await settleInputs();
    if (problem.value) return;
    if (id.value) await updateAddress(id.value, form.value);
    else await createAddress(form.value);
    uni.showToast({ title: 'Saved', icon: 'success' });
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
.section { display: block; font-weight: 700; font-size: 30rpx; }
.label { display: block; font-weight: 600; font-size: 26rpx; margin: 24rpx 0 10rpx; }
.input, .select { width: auto; height: 88rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; background: var(--pp-surface); color: var(--pp-ink); }
.input + .input { margin-top: 12rpx; }
.select { width: 100%; font-family: inherit; }
.row { display: flex; gap: 16rpx; }
.col { flex: 1; }
.note { display: block; margin-bottom: 16rpx; color: var(--pp-muted); font-size: 24rpx; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; }
.hint { display: block; text-align: center; color: var(--pp-muted); font-size: 24rpx; }
.primary { margin-top: 16rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
