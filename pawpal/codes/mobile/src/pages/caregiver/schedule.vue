<template>
  <view v-if="schedule" class="content">
    <view class="card">
      <text class="section">Settings</text>
      <text class="label">Travel buffer before and after each visit</text>
      <view class="choices">
        <text v-for="m in BUFFER_CHOICES" :key="m" class="choice" :class="{ on: settings.travelBufferMin === m }" :data-test="`buffer-${m}`" @click="setSetting('travelBufferMin', m)">{{ m }} min</text>
      </view>
      <text class="label">Longest overtime I accept</text>
      <view class="choices">
        <text v-for="m in OVERTIME_CHOICES" :key="m" class="choice" :class="{ on: settings.overtimeMaxMin === m }" :data-test="`overtime-${m}`" @click="setSetting('overtimeMaxMin', m)">{{ m ? `${m} min` : 'None' }}</text>
      </view>
      <text class="muted">Owners cannot book more overtime than this.</text>
    </view>

    <view class="card">
      <text class="section">Add "Not available"</text>
      <view class="choices">
        <text class="choice" :class="{ on: form.kind === 'once' }" data-test="kind-once" @click="form.kind = 'once'">One day</text>
        <text class="choice" :class="{ on: form.kind === 'weekly' }" data-test="kind-weekly" @click="form.kind = 'weekly'">Every week</text>
      </view>
      <view class="row">
        <select v-if="form.kind === 'once'" v-model="form.date" class="select" data-test="block-date">
          <option v-for="d in days" :key="d.date" :value="d.date">{{ d.title }}</option>
        </select>
        <select v-else v-model.number="form.weekday" class="select" data-test="block-weekday">
          <option v-for="w in WEEKDAY_OPTIONS" :key="w.value" :value="w.value">Every {{ w.label }}</option>
        </select>
      </view>
      <view class="row">
        <select v-model.number="form.start" class="select" data-test="block-start">
          <option v-for="t in TIME_OPTIONS.slice(0, -1)" :key="t.value" :value="t.value">From {{ t.label }}</option>
        </select>
        <select v-model.number="form.end" class="select" data-test="block-end">
          <option v-for="t in TIME_OPTIONS.slice(1)" :key="t.value" :value="t.value">To {{ t.label }}</option>
        </select>
      </view>
      <text class="link" data-test="all-day" @click="allDay">{{ isAllDay(form) ? 'All day' : 'Make it all day' }}</text>
      <text v-if="error" class="error" data-test="error">{{ error }}</text>
      <button class="primary" data-test="add-block" :disabled="busy" @click="add">Add</button>
    </view>

    <text class="muted center">Free 7:00 am – 10:00 pm unless blocked. Booked visits and their travel buffer cannot be blocked.</text>

    <view v-for="d in days" :key="d.date" class="day" :data-test="`day-${d.date}`">
      <text class="day-title">{{ d.title }}</text>
      <text v-if="!d.items.length" class="muted">Free all day</text>
      <view v-for="i in d.items" :key="`${i.kind}-${i.id}-${i.start}`" class="item" :class="i.kind" :data-test="`item-${i.kind}`">
        <text class="time">{{ rangeText(i) }}</text>
        <text class="what">{{ i.label }}</text>
        <text v-if="i.kind === 'visit'" class="lock">🔒</text>
        <text v-if="i.kind === 'off'" class="remove" :data-test="`remove-block-${i.id}`" @click="remove(i.id, i.weekly)">{{ confirmId === i.id ? 'Tap again to remove' : 'Remove' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { BUFFER_CHOICES, DAY_END, DAY_START, OVERTIME_CHOICES, type Schedule, type ScheduleSettings } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { addBlock, getSchedule, removeBlock, saveScheduleSettings } from '@/api/schedule';
import { TIME_OPTIONS, WEEKDAY_OPTIONS, blockFormToInput, emptyBlockForm, isAllDay, rangeText, scheduleDays } from '@/schedule';

const schedule = ref<Schedule | null>(null);
const form = ref(emptyBlockForm(''));
const busy = ref(false);
const error = ref('');
const confirmId = ref<number | null>(null);

const settings = computed(() => schedule.value!.settings);
const days = computed(() => (schedule.value ? scheduleDays(schedule.value) : []));

onShow(async () => {
  const u = await requireUser('/pages/caregiver/schedule');
  if (!u) return;
  if (u.caregiverStatus !== 'approved') {
    uni.redirectTo({ url: '/pages/apply/status' });
    return;
  }
  schedule.value = await getSchedule();
  form.value = emptyBlockForm(schedule.value.today);
});

async function run(work: () => Promise<Schedule>, done?: string) {
  error.value = '';
  busy.value = true;
  try {
    schedule.value = await work();
    if (done) uni.showToast({ title: done, icon: 'none' });
  } catch (e) {
    error.value = (e as Error).message;
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function setSetting(key: keyof ScheduleSettings, value: number) {
  if (busy.value || settings.value[key] === value) return;
  void run(() => saveScheduleSettings({ ...settings.value, [key]: value }), 'Saved');
}

function allDay() {
  form.value.start = DAY_START;
  form.value.end = DAY_END;
}

function add() {
  void run(() => addBlock(blockFormToInput(form.value)), 'Added');
}

/** Two taps to remove; a weekly block goes from every week. */
function remove(id: number, weekly?: boolean) {
  if (confirmId.value !== id) {
    confirmId.value = id;
    if (weekly) uni.showToast({ title: 'This removes it from every week', icon: 'none' });
    return;
  }
  confirmId.value = null;
  void run(() => removeBlock(id), 'Removed');
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 10rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.label { font-weight: 600; font-size: 26rpx; margin-top: 12rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.center { text-align: center; margin: 0 0 20rpx; }
.choices { display: flex; flex-wrap: wrap; gap: 14rpx; }
.choice { padding: 12rpx 26rpx; border: 1px solid var(--pp-border); border-radius: 999rpx; font-size: 26rpx; }
.choice.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.row { display: flex; gap: 16rpx; }
.select { flex: 1; height: 80rpx; padding: 0 16rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; font-family: inherit; background: var(--pp-surface); color: var(--pp-ink); }
.link { color: var(--pp-primary-strong); font-weight: 600; font-size: 26rpx; }
.error { color: var(--pp-danger); font-size: 26rpx; }
.primary { margin-top: 8rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
.day { padding: 20rpx 8rpx; border-bottom: 1px solid var(--pp-border); }
.day-title { display: block; font-weight: 700; margin-bottom: 8rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 10rpx 16rpx; margin-top: 6rpx; border-radius: 10rpx; font-size: 26rpx; }
.item.visit { background: var(--pp-primary-strong); color: var(--pp-surface); font-weight: 600; }
.item.buffer { background: var(--pp-background); color: var(--pp-muted); }
.item.off { border: 1px dashed var(--pp-border); }
.time { width: 280rpx; flex: none; }
.what { flex: 1; }
.remove { color: var(--pp-danger); font-size: 24rpx; }
</style>
