<template>
  <view v-if="result" class="content">
    <view class="card" data-test="cancel-result">
      <text class="section" data-test="result-title">{{ resultTitle }}</text>
      <view v-for="x in resultLines" :key="x.index" class="result" :class="x.ok ? 'ok' : 'bad'" data-test="result-line">
        <text class="strong">{{ x.ok ? '✓' : '✗' }} Visit {{ x.index + 1 }} · {{ lineOf(x.index)?.when }}</text>
        <text :data-test="`result-text-${x.index}`">{{ x.text }}</text>
      </view>
      <text v-if="result.cancelled.length" class="note" data-test="result-split">{{ refundSplitText(result.refundSen, result.creditSen) }}</text>
      <text v-if="result.refundSen > result.creditSen" class="note">Money usually reaches you in 3 to 7 working days. You can follow it on the order.</text>
      <text v-if="result.orderCancelled" class="note" data-test="order-cancelled">Every visit is now cancelled, so the order is cancelled.</text>
    </view>
    <button class="primary" data-test="back-to-order" @click="back">Back to order</button>
  </view>

  <view v-else-if="preview" class="content">
    <view class="card">
      <text class="section">Choose visits to cancel</text>
      <view v-for="l in preview.lines" :key="l.index" class="line" :class="{ off: l.blocked, on: picked.has(l.index) }" :data-test="`line-${l.index}`" @click="toggle(l)">
        <text class="box" :data-test="`pick-${l.index}`">{{ l.blocked ? '–' : picked.has(l.index) ? '☑' : '☐' }}</text>
        <view class="what">
          <text class="strong">Visit {{ l.index + 1 }} · {{ l.when }}</text>
          <text class="note" :data-test="`line-text-${l.index}`">{{ cancelLineText(l) }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="row"><text class="section">Refund</text><text class="section" data-test="cancel-total">{{ formatRM(total.refund) }}</text></view>
      <text class="note" data-test="refund-split">{{ refundSplitText(total.refund, total.credit) }}</text>
      <text class="note">Worked out from when you tap the button: 24 h or more before a visit 100%, 1 to 24 h 80%, under 1 h nothing. If a line passes first, we show the new amount and ask again.</text>
    </view>

    <text v-if="changed" class="warn" data-test="amount-changed">{{ changed }}</text>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="danger" data-test="cancel-submit" :disabled="!picked.size || busy" @click="submit">{{ picked.size ? `Cancel ${picked.size} visit${picked.size === 1 ? '' : 's'}` : 'Choose a visit' }}</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cancelConfirmText, cancelLineText, cancelledResultText, formatRM, refundSplitText, type CancelLine, type CancelPreview, type CancelResult } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { cancelVisits, getCancelPreview } from '@/api/booking';
import { ApiError } from '@/api/client';
import { confirmBox } from '@/order-actions';

const preview = ref<CancelPreview | null>(null);
const picked = reactive(new Set<number>());
const result = ref<CancelResult | null>(null);
const error = ref('');
const changed = ref('');
const busy = ref(false);
let id = 0;

const chosen = computed(() => (preview.value?.lines ?? []).filter((l) => picked.has(l.index)));
const total = computed(() => ({ refund: chosen.value.reduce((s, l) => s + l.refundSen, 0), credit: chosen.value.reduce((s, l) => s + l.creditSen, 0) }));
const lineOf = (i: number) => preview.value?.lines[i];
/** R43-2: every ticked visit, in order: cancelled with its amount, or why not. */
const resultLines = computed(() => {
  const r = result.value;
  if (!r) return [];
  return [...r.cancelled.map((c) => ({ index: c.index, ok: true, text: cancelledResultText(c) })), ...r.failed.map((f) => ({ index: f.index, ok: false, text: f.reason }))].sort((a, b) => a.index - b.index);
});
const resultTitle = computed(() => {
  const n = result.value?.cancelled.length ?? 0;
  if (!n) return 'Nothing was cancelled';
  const what = n === 1 ? 'Visit cancelled' : `${n} visits cancelled`;
  return result.value!.failed.length ? `${what}, ${result.value!.failed.length} not` : what;
});

/** Keeps only the ticks that can still be cancelled. */
function setPreview(p: CancelPreview) {
  preview.value = p;
  for (const i of [...picked]) if (p.lines[i]?.blocked !== null) picked.delete(i);
}

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  if (!(await requireUser(`/pages/orders/cancel?id=${id}`))) return;
  try {
    const p = await getCancelPreview(id);
    // R42-2: from O14 the visit comes ticked.
    if (q?.i !== undefined && p.lines[Number(q.i)] && !p.lines[Number(q.i)].blocked) picked.add(Number(q.i));
    setPreview(p);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function toggle(l: CancelLine) {
  if (l.blocked || busy.value) return;
  if (picked.has(l.index)) picked.delete(l.index);
  else picked.add(l.index);
}

async function submit() {
  error.value = '';
  if (!(await confirmBox('Cancel visits', cancelConfirmText(picked.size, total.value.refund)))) return;
  busy.value = true;
  const lines = chosen.value;
  try {
    result.value = await cancelVisits(id, lines.map((l) => l.index), lines.map((l) => l.percent!));
    if (result.value.cancelled.length) uni.showToast({ title: 'Cancelled', icon: 'success' });
  } catch (e) {
    // R42-4: time passed a 24 h or 1 h line; show the new amounts and let the owner confirm again.
    if (e instanceof ApiError && e.code === 'AMOUNT_CHANGED') {
      setPreview(e.body.preview as CancelPreview);
      changed.value = e.message;
    } else {
      error.value = (e as Error).message;
      setPreview(await getCancelPreview(id).catch(() => preview.value!));
    }
  } finally {
    busy.value = false;
  }
}

/** Back to O13; opened straight from a link there is no page behind, so open the order. */
const back = () => (getCurrentPages().length > 1 ? uni.navigateBack() : uni.redirectTo({ url: `/pages/orders/detail?id=${id}` }));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; font-size: 28rpx; }
.line { display: flex; align-items: center; gap: 20rpx; padding: 16rpx 0; border-bottom: 1px solid var(--pp-border); }
.line:last-child { border-bottom: none; }
.line.off { opacity: 0.5; }
.line .box { font-size: 40rpx; width: 48rpx; text-align: center; color: var(--pp-muted); }
.line.on .box { color: var(--pp-danger); }
.what { display: flex; flex-direction: column; gap: 4rpx; flex: 1; font-size: 28rpx; }
.result { display: flex; flex-direction: column; gap: 4rpx; padding: 12rpx 0; border-bottom: 1px solid var(--pp-border); font-size: 28rpx; }
.result.ok { color: var(--pp-ink); }
.result.bad { color: var(--pp-danger); }
.warn { padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); color: var(--pp-danger); font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.danger { width: 100%; background: var(--pp-danger); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.danger[disabled] { background: var(--pp-danger) !important; color: var(--pp-surface) !important; opacity: 0.45; }
</style>
