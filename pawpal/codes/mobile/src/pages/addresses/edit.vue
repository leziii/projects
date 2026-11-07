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

    <view class="card">
      <text class="section">Home position</text>
      <view v-if="form.home" class="pin" data-test="home-state">
        <text class="pin-icon">📍</text>
        <text class="pin-address" data-test="home-address">{{ homeLine || 'Position set' }}</text>
      </view>
      <text v-else class="note" data-test="home-state">Not set. Tap the button while you are at this address.</text>
      <text v-if="form.home" class="note">Used only to check the caregiver is at your home.</text>
      <text v-if="form.home" class="map-link" data-test="view-map" @click="viewMap">Check it on the map ›</text>
      <view class="row">
        <button class="ghost col" data-test="use-location" :disabled="locating" @click="useLocation">{{ locating ? 'Finding you…' : 'Use my current location' }}</button>
        <button v-if="form.home" class="ghost" data-test="clear-location" @click="form.home = null">Clear</button>
      </view>
      <text v-if="locationError" class="error" data-test="location-error">{{ locationError }}</text>
    </view>

    <text class="note">Gate or door instructions are asked when you book, not saved here.</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <view v-else-if="problems.length" class="missing" data-test="missing">
      <text class="missing-title">To save, please fill in:</text>
      <text v-for="p in problems" :key="p" class="missing-item" data-test="hint">• {{ p }}</text>
    </view>
    <button class="primary" data-test="save" :disabled="!!problem || busy" @click="save">Save</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ADDRESS_RULES, AREAS } from '@pawpal/shared';
import { createAddress, getAddress, updateAddress } from '@/api/addresses';
import { requireUser } from '@/api/auth';
import { addressProblems, addressToForm, emptyAddress } from '@/addresses';
import { settleInputs } from '@/inputs';
import { currentLocation, mapLink } from '@/location';

const form = ref(emptyAddress());
const id = ref(0);
const ready = ref(false);
const busy = ref(false);
const error = ref('');
const problems = computed(() => addressProblems(form.value));
const problem = computed(() => problems.value[0] ?? '');
const homeLine = computed(() => {
  const { unit, street, postcode, area } = form.value;
  return [unit, street, [postcode, area].filter(Boolean).join(' ')].map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
});
const locating = ref(false);
const locationError = ref('');

/** R38-2 (KF hand test): open the saved point in Google Maps so the owner can see it is right. No map key needed. */
function viewMap() {
  window.open(mapLink(form.value.home!), '_blank');
}

/** R38-2: the owner sets the home position while at home; no map service needed. */
async function useLocation() {
  locating.value = true;
  locationError.value = '';
  const here = await currentLocation();
  locating.value = false;
  if (here) form.value.home = here;
  else locationError.value = 'Could not get your location. Allow location for this site and try again.';
}

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
.missing { margin-bottom: 20rpx; padding: 20rpx 24rpx; border: 2rpx solid var(--pp-danger); border-radius: var(--pp-radius-card); background: var(--pp-surface); }
.missing-title { display: block; margin-bottom: 8rpx; color: var(--pp-danger); font-weight: 600; font-size: 26rpx; }
.missing-item { display: block; color: var(--pp-ink); font-size: 26rpx; line-height: 1.6; }
.pin { display: flex; align-items: flex-start; gap: 12rpx; margin-bottom: 8rpx; }
.pin-icon { font-size: 32rpx; line-height: 1.3; }
.pin-address { flex: 1; color: var(--pp-ink); font-weight: 600; font-size: 28rpx; line-height: 1.4; }
.map-link { display: block; margin-top: 8rpx; color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.ghost { margin: 16rpx 0 8rpx; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-size: 28rpx; }
.primary { margin-top: 16rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
