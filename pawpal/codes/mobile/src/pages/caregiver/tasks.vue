<template>
  <view class="content with-nav">
    <scroll-view scroll-x class="days">
      <view class="day-row">
        <view v-for="d in list?.days ?? []" :key="d.date" class="day" :class="{ on: d.date === list?.date }" :data-test="`day-${d.date}`" @click="choose(d.date)">
          <text class="day-top">{{ dayParts(d.date)[0] }}</text>
          <text class="day-name">{{ dayParts(d.date)[1] }}</text>
          <text v-if="d.count" class="count" data-test="day-count">{{ d.count }}</text>
          <text v-else class="count none">·</text>
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
          <view class="where">
            <view class="task-icon"><PpIcon name="paw" :size="20" /></view>
            <view class="where-text">
              <text class="line" data-test="task-area">{{ t.area }}</text>
              <text class="note" data-test="task-pets">{{ taskPets(t) }}</text>
            </view>
          </view>
          <view class="row">
            <text class="note" data-test="task-length">{{ t.minutes }} min · {{ t.number }}</text>
            <text v-if="t.status !== 'cancelled'" class="link">›</text>
          </view>
        </view>
      </template>
      <text v-if="!list.tasks.length" class="note center" data-test="no-tasks">No tasks on this day.</text>
    </template>
    <BottomNav role="caregiver" active="tasks" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { TASK_STATUS_LABEL, dayText, klDate, taskGap, taskPets, taskTime, type Task, type TaskList } from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { getTasks } from '@/api/requests';
import BottomNav from '@/components/BottomNav.vue';
import PpIcon from '@/components/PpIcon.vue';

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
/** The day chip in two lines: "Wed" over "5 Nov" ("Today" over "5 Nov"). */
const dayParts = (date: string) => {
  const [name, ...rest] = dayText(date).split(' ');
  return [dayLabel(date) === 'Today' ? 'Today' : name, rest.join(' ')];
};

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
.content { display: flex; flex-direction: column; padding: 32rpx; gap: 20rpx; }
.days { white-space: nowrap; }
.day-row { display: flex; gap: 14rpx; padding: 4rpx 0 8rpx; }
.day { display: flex; flex-direction: column; align-items: center; gap: 2rpx; min-width: 112rpx; padding: 16rpx 12rpx; border-radius: 28rpx; background: var(--pp-surface); box-shadow: var(--pp-shadow); }
.day.on { background: var(--pp-ink); color: var(--pp-surface); }
.day-top { font-size: 22rpx; color: var(--pp-muted); }
.day.on .day-top { color: var(--pp-primary-soft); }
.day-name { font-size: 26rpx; font-weight: 700; }
.count { font-size: 22rpx; font-weight: 800; color: var(--pp-primary-strong); }
.day.on .count { color: var(--pp-primary); }
.count.none { color: var(--pp-border); }
.card { display: flex; flex-direction: column; gap: 16rpx; padding: 30rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
uni-page-body .card.muted { opacity: 0.55; box-shadow: none; border: 2rpx dashed var(--pp-border); background: transparent; }
.row { display: flex; justify-content: space-between; align-items: center; }
.strong { font-weight: 800; font-size: 32rpx; }
.where { display: flex; align-items: center; gap: 20rpx; }
.task-icon { width: 72rpx; height: 72rpx; border-radius: 22rpx; background: var(--pp-primary-soft); color: var(--pp-primary-strong); display: flex; align-items: center; justify-content: center; }
.where-text { display: flex; flex-direction: column; flex: 1; }
.line { font-size: 28rpx; font-weight: 700; }
.note { font-size: 26rpx; color: var(--pp-muted); }
.center { text-align: center; padding: 48rpx 0; }
.tag { padding: 6rpx 20rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 700; background: color-mix(in srgb, var(--pp-info) 12%, var(--pp-surface)); color: var(--pp-info); }
.tag.cancelled, .tag.moved, .tag.closed { background: color-mix(in srgb, var(--pp-muted) 14%, var(--pp-surface)); color: var(--pp-muted); }
.tag.disputed { background: var(--pp-danger); color: var(--pp-surface); }
.tag.arrived, .tag.in_service { background: var(--pp-primary); color: var(--pp-ink); }
.tag.report_sent, .tag.confirmed { background: color-mix(in srgb, var(--pp-success) 14%, var(--pp-surface)); color: var(--pp-success); }
.link { color: var(--pp-primary-strong); font-weight: 700; }
.gap { align-self: center; font-size: 24rpx; font-weight: 600; color: var(--pp-muted); padding: 4rpx 24rpx; border-radius: 999rpx; background: var(--pp-surface); }
.gap.tight { color: var(--pp-danger); }
.error { color: var(--pp-danger); }
</style>
