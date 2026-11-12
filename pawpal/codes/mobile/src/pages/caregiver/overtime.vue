<template>
  <view v-if="info" class="content">
    <view class="card">
      <text class="section">Visit {{ info.index + 1 }} · {{ info.number }}</text>
      <text class="note" data-test="ends-at">Service ends {{ timeText(info.endMin) }} · your overtime limit {{ info.limitMin }} min<text v-if="info.bookedMin"> ({{ info.bookedMin }} min already booked)</text></text>
    </view>

    <view v-if="info.open" class="card" data-test="open-request">
      <template v-if="info.open.status === 'paid'">
        <text class="strong" data-test="open-text">Owner paid: {{ overtimeText(info.open.units) }}</text>
        <text class="note" data-test="paid-until">You may stay until {{ timeText(info.endMin + info.open.units * OVERTIME_RULES.unitMin) }}.</text>
      </template>
      <template v-else>
        <text class="strong" data-test="open-text">Asked: {{ overtimeText(info.open.units) }}</text>
        <text class="note">Waiting for the owner to approve and pay. Until then, do only the booked service.</text>
        <button class="ghost" data-test="withdraw" :disabled="busy" @click="withdraw">Withdraw request</button>
      </template>
    </view>

    <view v-else-if="info.choices.length" class="card">
      <text class="section">How much more time?</text>
      <view
        v-for="c in info.choices"
        :key="c.units"
        class="choice"
        :class="{ on: units === c.units, off: !c.fits }"
        :data-test="`units-${c.units}`"
        @click="pick(c.units, c.fits)"
      >
        <text class="strong">{{ overtimeText(c.units) }}</text>
        <text :class="c.fits ? 'ok' : 'bad'" :data-test="`fit-${c.units}`">{{ c.fits ? '✓' : '✗' }} {{ c.text }}</text>
      </view>
      <text class="note">{{ formatRM(OVERTIME_RULES.unitSen) }} per {{ OVERTIME_RULES.unitMin }} min. The owner approves and pays first; unpaid overtime is not done.</text>
      <button class="primary" data-test="send-overtime" :disabled="busy || !units" @click="send">Send request to the owner</button>
    </view>

    <view v-else class="card" data-test="no-overtime">
      <text class="note">No overtime left on this visit: your limit is {{ info.limitMin }} min<text v-if="info.bookedMin"> and {{ info.bookedMin }} min is already booked</text>. You can change the limit in your schedule.</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="ghost" data-test="back-to-service" @click="back">Back to service</button>
  </view>
  <view v-else-if="error" class="content">
    <text class="error" data-test="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { OVERTIME_RULES, formatRM, overtimeText, timeText, type OvertimeInfo } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { askOvertime, getOvertime, withdrawOvertime } from '@/api/requests';
import { confirmBox } from '@/order-actions';

/** E11-2 S14 Overtime (round 46): pick 15-min units that fit the schedule and ask the owner. */
const info = ref<OvertimeInfo | null>(null);
const units = ref(0);
const error = ref('');
const busy = ref(false);
let id = 0;
let index = 0;

async function run(call: () => Promise<OvertimeInfo>) {
  busy.value = true;
  error.value = '';
  try {
    info.value = await call();
    units.value = 0;
  } catch (e) {
    error.value = (e as Error).message;
    info.value = await getOvertime(id, index).catch(() => info.value);
  } finally {
    busy.value = false;
  }
}

onLoad(async (q) => {
  id = Number(q?.id) || 0;
  index = Number(q?.i) || 0;
  if (!(await requireUser(`/pages/caregiver/overtime?id=${id}&i=${index}`))) return;
  try {
    info.value = await getOvertime(id, index);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

/** R46-3: a time that clashes cannot be picked. */
function pick(n: number, fits: boolean) {
  if (fits && !busy.value) units.value = n;
}

async function send() {
  if (!(await confirmBox('Ask for overtime', `Ask the owner for ${overtimeText(units.value)}?`))) return;
  await run(() => askOvertime(id, index, units.value));
  if (!error.value) uni.showToast({ title: 'Sent', icon: 'success' });
}

async function withdraw() {
  if (!(await confirmBox('Withdraw request', 'The owner is told there is nothing to pay.'))) return;
  await run(() => withdrawOvertime(id, index));
}

const back = () => (getCurrentPages().length > 1 ? uni.navigateBack() : uni.redirectTo({ url: `/pages/caregiver/service?id=${id}&i=${index}` }));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.strong { font-weight: 600; font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.choice { display: flex; flex-direction: column; gap: 4rpx; padding: 16rpx; border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.choice.on { border: 2px solid var(--pp-primary-strong); background: var(--pp-background); }
.choice.off { opacity: 0.6; }
.ok { color: var(--pp-primary-strong); font-size: 26rpx; }
.bad { color: var(--pp-danger); font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; text-align: center; }
.primary { width: 100%; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost { width: 100%; background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
