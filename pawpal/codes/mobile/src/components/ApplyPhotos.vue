<template>
  <view class="photos">
    <view v-for="f in mine" :key="f.id" class="thumb-box" :data-test="`file-${kind}`">
      <image class="thumb" :src="thumbs[f.id] || ''" mode="aspectFill" />
      <text v-if="editable" class="remove" :data-test="`remove-${kind}`" @click="emit('remove', f.id)">Remove</text>
    </view>
    <text v-if="editable && room" class="ghost-btn" :data-test="`add-${kind}`" @click="emit('add', kind)">{{ mine.length ? 'Change photo' : 'Add photo' }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FILE_LIMIT, type ApplicationFile, type ApplicationFileKind } from '@pawpal/shared';

/** Document photos of one kind (S02): thumbnails with Remove, and Add while there is room. One-photo kinds show Change. */
const props = defineProps<{ kind: ApplicationFileKind; files: ApplicationFile[]; thumbs: Record<number, string>; editable: boolean }>();
const emit = defineEmits<{ add: [kind: ApplicationFileKind]; remove: [id: number] }>();

const mine = computed(() => props.files.filter((f) => f.kind === props.kind));
const room = computed(() => FILE_LIMIT[props.kind] === 1 || mine.value.length < FILE_LIMIT[props.kind]);
</script>

<style>
.photos { display: flex; flex-wrap: wrap; gap: 16rpx; align-items: center; }
.thumb-box { display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.thumb { width: 160rpx; height: 120rpx; border-radius: 12rpx; background: var(--pp-background); }
.remove { font-size: 24rpx; color: var(--pp-danger); }
.ghost-btn { padding: 14rpx 28rpx; border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); color: var(--pp-primary-strong); font-size: 26rpx; }
</style>
