<template>
  <view v-if="r" class="content">
    <view class="card">
      <view class="row">
        <text class="tag" :class="{ urgent: r.urgent && r.open }" data-test="detail-tag">{{ tagText(r) }}</text>
        <text class="left" :class="{ ended: !r.open }" data-test="detail-left">{{ r.open ? leftText(r, now) : REQUEST_END_LABEL[r.end ?? 'expired'] }}</text>
      </view>
      <view class="copyable" data-test="copy-number" @click="copyText(r.number, 'Request number copied')"><text class="number" data-test="detail-number">Request {{ r.number }}</text><view class="copy-icon" aria-label="Copy" data-test="copy-icon"><view class="sheet back" /><view class="sheet front" /></view></view>
      <text v-if="!r.address" class="note">{{ r.area }} (the full address shows after you accept)</text>
    </view>

    <view v-if="r.address" class="card" data-test="detail-address">
      <text class="section">Address</text>
      <text class="line" data-test="address-street">{{ r.address.unit }}, {{ r.address.street }}, {{ r.address.postcode }} {{ r.area }}</text>
      <text class="line" data-test="address-contact">Contact: {{ r.address.contactName }} · {{ r.address.contactPhone }}</text>
      <text class="note">How to get in (key or lock) shows before the visit.</text>
    </view>

    <view class="card">
      <text class="section">Visits ({{ r.visits }})</text>
      <view v-for="v in r.visitLines" :key="v.label" class="line" data-test="detail-visit">
        <text>{{ v.label }} · {{ v.minutes }} min</text>
        <text class="strong">{{ formatRM(v.incomeSen) }}</text>
      </view>
      <view class="line total"><text>You earn</text><text data-test="detail-income">{{ formatRM(r.incomeSen) }}</text></view>
      <text class="note">85% of the full price. Promo codes and credit never lower it.</text>
    </view>

    <view class="card">
      <text class="section">Pets</text>
      <text v-for="p in r.petList" :key="p.name" class="line" data-test="detail-pet">{{ p.name }} · {{ p.kind === 'dog' ? 'Dog' : 'Cat' }}</text>
    </view>

    <!-- Stays after the page reloads, so the caregiver sees why the request closed (R28-6). -->
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <template v-if="r.open">
      <text class="note">You can only accept the whole order. We check every visit against your schedule.</text>
      <button class="primary" data-test="accept" :disabled="busy" @click="accept">Accept whole order</button>
      <view v-if="saying" class="card" data-test="reject-box">
        <text class="section">Why can't you take it?</text>
        <text class="note">The owner does not see this.</text>
        <view class="reasons">
          <text v-for="o in REJECT_REASONS" :key="o.value" class="chip" :class="{ on: reason === o.value }" :data-test="`reason-${o.value}`" @click="reason = o.value">{{ o.label }}</text>
        </view>
        <button class="danger" data-test="reject-confirm" :disabled="!reason || busy" @click="reject">Say no to this order</button>
        <text class="fix" data-test="reject-back" @click="saying = false">Back</text>
      </view>
      <button v-else class="ghost" data-test="reject" :disabled="busy" @click="saying = true">Say no</button>
    </template>
    <text v-else class="note" data-test="detail-next">{{ endText }}</text>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { REJECT_REASONS, REQUEST_END_LABEL, REQUEST_RULES, formatRM, type RejectReason, type RequestDetail } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { acceptRequest, getRequest, rejectRequest } from '@/api/requests';
import { anyExpired, leftText, requestUrl, tagText } from '@/requests';
import { copyText } from '@/copy';

const r = ref<RequestDetail | null>(null);
const error = ref('');
const busy = ref(false);
const saying = ref(false);
const reason = ref<RejectReason | ''>('');
const endText = computed(() => {
  if (r.value?.end === 'accepted') return 'You accepted this order. The visits are in your schedule.';
  if (r.value?.end === 'rejected') return 'You said no. The owner gets a full refund.';
  return 'This request can no longer be accepted.';
});
const now = ref(new Date());
let id = 0;
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    r.value = await getRequest(id);
    now.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function act(run: () => Promise<RequestDetail>, done: string) {
  error.value = '';
  busy.value = true;
  try {
    r.value = await run();
    uni.showToast({ title: done, icon: 'success' });
  } catch (e) {
    error.value = (e as Error).message;
    // Closed meanwhile (deadline or owner): show the latest state.
    if (/no longer open|withdrew/.test(error.value)) await load();
  } finally {
    busy.value = false;
  }
}

const accept = () => act(() => acceptRequest(id), 'Accepted');
const reject = () => act(() => rejectRequest(id, reason.value as RejectReason), 'Done');

onLoad((query) => {
  id = Number(query?.id) || 0;
});

onShow(async () => {
  if (!(await requireUser(requestUrl(id)))) return;
  await load();
  clearInterval(timer);
  timer = setInterval(() => {
    now.value = new Date();
    if (r.value?.open && anyExpired([r.value], now.value)) void load();
  }, REQUEST_RULES.tickMs);
});
onHide(() => clearInterval(timer));
onUnload(() => clearInterval(timer));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.row { display: flex; justify-content: space-between; align-items: center; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.tag.urgent { background: var(--pp-danger); color: var(--pp-surface); }
.left { font-weight: 600; }
.left.ended { color: var(--pp-danger); }
.copyable { display: flex; gap: 16rpx; align-items: center; margin-top: 16rpx; }
.number { display: block; font-size: 34rpx; font-weight: 700; }
.section { display: block; font-weight: 700; margin-bottom: 8rpx; }
.line { display: flex; justify-content: space-between; padding: 10rpx 0; font-size: 28rpx; }
.total { border-top: 1px solid var(--pp-border); margin-top: 8rpx; font-weight: 700; }
.strong { font-weight: 600; }
.note { display: block; font-size: 26rpx; color: var(--pp-muted); }
.error { color: var(--pp-danger); }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost { color: var(--pp-danger); background: var(--pp-surface); border: 1px solid var(--pp-danger); border-radius: var(--pp-radius-button); }
.danger { margin-top: 20rpx; background: var(--pp-danger); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.danger[disabled] { background: var(--pp-danger) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.reasons { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.chip { padding: 12rpx 24rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; font-size: 26rpx; }
.chip.on { border-color: var(--pp-primary-strong); color: var(--pp-primary-strong); font-weight: 600; }
.fix { display: block; margin-top: 16rpx; text-align: center; color: var(--pp-primary-strong); }
</style>
