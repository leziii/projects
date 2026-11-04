<template>
  <view v-if="loaded" class="content">
    <view v-if="!addresses.length" class="card empty" data-test="no-addresses">
      <text class="big">No addresses yet</text>
      <text class="muted">Add where the caregiver should come, and who they can call.</text>
    </view>

    <view v-for="a in addresses" :key="a.id" class="card" data-test="address">
      <view class="top">
        <text class="label" data-test="address-label">{{ a.label }}</text>
        <text v-if="a.isDefault" class="chip" data-test="default">Default</text>
        <text v-else class="link" data-test="make-default" @click="setDefault(a.id)">Make default</text>
      </view>
      <text class="line" data-test="address-line">{{ addressLine(a) }}</text>
      <text class="muted">Contact: {{ contactLine(a.contactName, a.contactPhone) }}</text>
      <text v-if="a.emergencyName" class="muted">Emergency: {{ contactLine(a.emergencyName, a.emergencyPhone) }}</text>
      <view class="actions">
        <text class="link" data-test="edit-address" @click="edit(a.id)">Edit</text>
        <text class="danger" data-test="delete-address" @click="remove(a)">Delete</text>
      </view>
    </view>

    <text class="note">Your address and contacts are stored encrypted. Only you see them now; the caregiver sees them once a booking is accepted.</text>
    <button class="primary" data-test="add-address" :disabled="addresses.length >= ADDRESS_RULES.maxAddresses" @click="edit()">
      {{ addresses.length >= ADDRESS_RULES.maxAddresses ? `Up to ${ADDRESS_RULES.maxAddresses} addresses` : 'Add address' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ADDRESS_RULES, addressLine, type Address } from '@pawpal/shared';
import { deleteAddress, listAddresses, makeDefaultAddress } from '@/api/addresses';
import { requireUser } from '@/api/auth';
import { contactLine } from '@/addresses';

const addresses = ref<Address[]>([]);
const loaded = ref(false);

onShow(async () => {
  if (!(await requireUser('/pages/addresses/index'))) return;
  addresses.value = await listAddresses();
  loaded.value = true;
});

function edit(id?: number) {
  uni.navigateTo({ url: id ? `/pages/addresses/edit?id=${id}` : '/pages/addresses/edit' });
}

async function setDefault(id: number) {
  addresses.value = await makeDefaultAddress(id);
}

// A tap on Delete asks first in the page itself (no browser dialog).
const confirming = ref(0);
async function remove(a: Address) {
  if (confirming.value !== a.id) {
    confirming.value = a.id;
    uni.showToast({ title: 'Tap Delete again to remove', icon: 'none' });
    return;
  }
  confirming.value = 0;
  addresses.value = await deleteAddress(a.id);
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 6rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.empty { text-align: center; }
.big { font-size: 34rpx; font-weight: 700; }
.top { display: flex; justify-content: space-between; align-items: center; }
.label { font-size: 32rpx; font-weight: 700; }
.chip { padding: 4rpx 18rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; border: 1px solid var(--pp-success); color: var(--pp-success); }
.line { margin-top: 6rpx; }
.muted { color: var(--pp-muted); font-size: 26rpx; }
.actions { display: flex; gap: 32rpx; margin-top: 12rpx; }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.danger { color: var(--pp-danger); font-weight: 600; }
.note { display: block; margin: 8rpx 0 20rpx; color: var(--pp-muted); font-size: 24rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
