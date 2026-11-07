<template>
  <view class="content">
    <scroll-view scroll-x class="days">
      <view class="day-row">
        <view v-for="d in list?.days ?? []" :key="d.date" class="day" :class="{ on: d.date === list?.date }" :data-test="`day-${d.date}`" @click="choose(d.date)">
          <text class="day-name">{{ dayLabel(d.date) }}</text>
          <text v-if="d.count" class="count" data-test="day-count">{{ d.count }}</text>
        </view>
      </view>
    </scroll-view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <template v-else-if="list">
      <template v-for="(t, i) in list.tasks" :key="`${t.orderId}-${t.start}`">
        <text v-if="i > 0 && gap(i)" class="gap" :class="{ tight: gap(i)!.tight }" data-test="gap">{{ gap(i)!.text }}</text>
        <view class="card" :class="{ muted: t.status === 'cancelled' }" data-test="task" @click="open(t)">
          <view class="row">
            <text class="strong" data-test="task-time">{{ taskTime(t) }}</text>
            <text class="tag" :class="t.status" data-test="task-status">{{ TASK_STATUS_LABEL[t.status] }}</text>
          </view>
          <text class="line" data-test="task-area">{{ t.area }}</text>
          <text class="note" data-test="task-pets">{{ taskPets(t) }}</text>
          <view class="row">
            <text class="note" data-test="task-length">{{ t.minutes }} min · {{ t.number }}</text>
            <text v-if="t.status !== 'cancelled'" class="link">›</text>
          </view>
        </view>
      </template>
      <text v-if="!list.tasks.length" class="note center" data-test="no-tasks">No tasks on this day.</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { TASK_STATUS_LABEL, dayText, klDate, taskGap, taskPets, taskTime, type Task, type TaskList } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getTasks } from '@/api/requests';

const list = ref<TaskList | null>(null);
const error = ref('');

async function load(date?: string) {
  error.value = '';
  try {
    list.value = await getTasks(date);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onShow(async () => {
  if (!(await requireUser('/pages/caregiver/tasks'))) return;
  await load(list.value?.date);
});
onPullDownRefresh(async () => {
  await load(list.value?.date);
  uni.stopPullDownRefresh();
});

/** "Today" or "Wed 5 Nov" */
const dayLabel = (date: string) => (date === klDate(new Date()) ? 'Today' : dayText(date));

function choose(date: string) {
  if (date !== list.value?.date) void load(date);
}

/** R33-4 */
const gap = (i: number) => taskGap(list.value!.tasks[i - 1], list.value!.tasks[i], list.value!.bufferMin);

/** R34-1: the visit page (S09); a cancelled visit does not open (R33-5). */
function open(t: Task) {
  if (t.status === 'cancelled') return;
  uni.navigateTo({ url: `/pages/caregiver/visit?id=${t.orderId}&i=${t.index}` });
}
</script>

<style>
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 16rpx; }
.days { white-space: nowrap; }
.day-row { display: flex; gap: 12rpx; }
.day { display: flex; flex-direction: column; align-items: center; gap: 4rpx; min-width: 120rpx; padding: 12rpx 16rpx; border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); background: var(--pp-surface); }
.day.on { background: var(--pp-primary-strong); border-color: var(--pp-primary-strong); color: var(--pp-surface); }
.day-name { font-size: 24rpx; font-weight: 600; }
.count { font-size: 22rpx; font-weight: 700; }
.card { display: flex; flex-direction: column; gap: 6rpx; padding: 28rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.card.muted { opacity: 0.5; }
.row { display: flex; justify-content: space-between; align-items: center; }
.strong { font-weight: 600; font-size: 30rpx; }
.line { font-size: 28rpx; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; padding: 48rpx 0; }
.tag { padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 600; background: var(--pp-background); color: var(--pp-primary-strong); }
.tag.cancelled { color: var(--pp-danger); }
.tag.disputed { background: var(--pp-danger); color: var(--pp-surface); }
.tag.arrived, .tag.in_service, .tag.report_sent, .tag.confirmed { background: var(--pp-primary-strong); color: var(--pp-surface); }
.link { color: var(--pp-primary-strong); font-weight: 600; }
.gap { align-self: center; font-size: 24rpx; color: var(--pp-muted); }
.gap.tight { color: var(--pp-danger); font-weight: 600; }
.error { color: var(--pp-danger); }
</style>
