<template>
  <view class="contact-picker">
    <view class="methods">
      <text v-for="m in CONTACT_METHODS" :key="m" class="method" :class="{ on: method === m }" :data-test="`method-${m}`" @click="emit('update:method', m)">{{ CONTACT_METHOD_LABEL[m] }}</text>
    </view>
    <input class="field" :value="note" data-test="contact-note" :maxlength="PROBLEM_RULES.noteMax" placeholder="Note, e.g. no answer" @input="onNote">
  </view>
</template>

<script setup lang="ts">
import { CONTACT_METHODS, CONTACT_METHOD_LABEL, PROBLEM_RULES, type ContactMethod } from '@pawpal/shared';

/** E12-1 S13 (R49-3): how the caregiver tried to reach the owner, and a short note. */
defineProps<{ method: ContactMethod; note: string }>();
const emit = defineEmits<{ 'update:method': [m: ContactMethod]; 'update:note': [n: string] }>();
const onNote = (e: Event) => emit('update:note', (e as unknown as { detail: { value: string } }).detail.value);
</script>

<style>
.contact-picker { display: flex; flex-direction: column; gap: 12rpx; }
.methods { display: flex; gap: 12rpx; }
.method { flex: 1; text-align: center; padding: 12rpx 0; border: 1px solid var(--pp-border); border-radius: var(--pp-radius-button); font-size: 26rpx; }
.method.on { border: 2px solid var(--pp-primary-strong); color: var(--pp-primary-strong); font-weight: 600; }
.contact-picker .field { border: 1px solid var(--pp-border); border-radius: 12rpx; padding: 12rpx 16rpx; font-size: 28rpx; height: 72rpx; }
</style>
