<template>
  <view class="photos">
    <view v-for="pid in photos" :key="pid" class="photo" data-test="photo">
      <image v-if="urls[pid]" :src="urls[pid]" mode="aspectFill" class="img" />
      <text class="remove" data-test="photo-delete" @click="remove(pid)">✕</text>
    </view>
    <view v-for="p in pending" :key="p.key" class="photo" :class="`is-${p.status}`" :data-test="`pending-${p.status}`">
      <image :src="p.preview" mode="aspectFill" class="img dim" />
      <view v-if="p.status === 'failed'" class="mask" data-test="retry" @click="upload(p)">
        <text>Upload failed</text>
        <text class="big">↻</text>
      </view>
      <text v-else class="mask busy">Uploading…</text>
      <text v-if="p.status === 'failed'" class="remove" data-test="pending-remove" @click="drop(p)">✕</text>
    </view>
    <view v-if="photos.length + pending.length < SERVICE_RULES.maxPhotos" class="photo add" data-test="photo-add" @click="pick">
      <text>+ Photo</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { SERVICE_RULES, type VisitTask } from '@pawpal/shared';
import { deleteVisitPhoto, uploadVisitPhoto, visitPhotoUrl } from '@/api/requests';
import { confirmBox } from '@/order-actions';
import { shrinkPhoto } from '@/photo-shrink';

/**
 * S11 / S12 photo grid (R36-4, R37-3): saved photos, plus photos still uploading or failed. A failed one stays in the
 * row with "Upload failed ↻" to retry, or ✕ to drop it.
 */
const props = defineProps<{ orderId: number; index: number; photos: number[] }>();
const emit = defineEmits<{ changed: [v: VisitTask]; state: [s: 'none' | 'uploading' | 'failed']; error: [message: string] }>();

interface Pending {
  key: number;
  file: Blob;
  preview: string;
  status: 'uploading' | 'failed';
}

const urls = reactive<Record<number, string>>({});
const pending = ref<Pending[]>([]);
let nextKey = 1;

watch(
  () => props.photos,
  (ids) => {
    for (const p of ids) {
      if (!urls[p]) visitPhotoUrl(props.orderId, props.index, p).then((u) => (urls[p] = u)).catch(() => undefined);
    }
  },
  { immediate: true },
);

watch(
  pending,
  (list) => emit('state', list.some((p) => p.status === 'failed') ? 'failed' : list.length ? 'uploading' : 'none'),
  { deep: true, immediate: true },
);

/** KF hand test (E9-2): several photos can be chosen at once, up to the 9 allowed. */
function pick() {
  const room = SERVICE_RULES.maxPhotos - props.photos.length - pending.value.length;
  if (room > 0) uni.chooseImage({ count: room, sourceType: ['camera', 'album'], success: (res) => void addAll(res.tempFiles as File[]) });
}

async function addAll(files: File[]) {
  const room = SERVICE_RULES.maxPhotos - props.photos.length - pending.value.length;
  const added: Pending[] = [];
  for (const file of files.slice(0, Math.max(0, room))) {
    pending.value.push({ key: nextKey++, file: await shrinkPhoto(file), preview: URL.createObjectURL(file), status: 'uploading' });
    added.push(pending.value[pending.value.length - 1]);
  }
  // One at a time, so each answer has every photo saved so far.
  for (const p of added) await upload(p);
}

async function upload(p: Pending) {
  p.status = 'uploading';
  try {
    emit('changed', await uploadVisitPhoto(props.orderId, props.index, p.file));
    drop(p);
  } catch {
    p.status = 'failed';
  }
}

function drop(p: Pending) {
  pending.value = pending.value.filter((x) => x.key !== p.key);
  URL.revokeObjectURL(p.preview);
}

async function remove(photoId: number) {
  if (!(await confirmBox('Delete photo', 'Delete this photo?'))) return;
  try {
    emit('changed', await deleteVisitPhoto(props.orderId, props.index, photoId));
  } catch (e) {
    emit('error', (e as Error).message);
  }
}
</script>

<style>
.photos { display: flex; flex-wrap: wrap; gap: 16rpx; }
.photo { position: relative; width: 196rpx; height: 196rpx; border-radius: 12rpx; overflow: hidden; background: var(--pp-background); box-sizing: border-box; }
.photo.is-failed { border: 2px solid var(--pp-danger); }
.img { width: 100%; height: 100%; }
.img.dim { opacity: 0.4; }
.mask { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 22rpx; color: var(--pp-danger); font-weight: 600; }
.mask.busy { color: var(--pp-muted); }
.big { font-size: 44rpx; }
.remove { position: absolute; top: 6rpx; right: 6rpx; width: 44rpx; height: 44rpx; border-radius: 50%; background: var(--pp-ink); color: var(--pp-surface); font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.add { display: flex; align-items: center; justify-content: center; border: 2px dashed var(--pp-border); color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
</style>
