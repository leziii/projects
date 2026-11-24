<template>
  <div>
    <div class="head">
      <div>
        <h2>Dashboard</h2>
        <p class="note" data-test="dashboard-note">{{ DASHBOARD_NOTE }}</p>
      </div>
      <el-tag :type="health?.status === 'ok' ? 'success' : 'danger'" round effect="light" data-test="health">
        {{ healthLabel(health) }}
      </el-tag>
    </div>
    <div class="cards" data-test="queues">
      <router-link v-for="q in queues" :key="q.key" :to="QUEUE_INFO[q.key].path" class="card" :class="queueTone(q)" :data-test="`queue-${q.key}`">
        <div class="tile"><PpIcon :name="QUEUE_ICON[q.key]" :size="20" /></div>
        <div class="count" :data-test="`queue-count-${q.key}`">{{ q.count }}</div>
        <div class="label">{{ QUEUE_INFO[q.key].label }}</div>
        <div class="sub" :data-test="`queue-text-${q.key}`">{{ queueCountText(q.count) }}</div>
      </router-link>
    </div>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { DASHBOARD_NOTE, DASHBOARD_RULES, QUEUE_INFO, queueCountText, queueTone, type HealthReport, type IconName, type QueueCount, type QueueKey } from '@pawpal/shared';
import PpIcon from '../components/PpIcon.vue';
import { fetchHealth, healthLabel } from '../api/health';
import { getQueues } from '../api/dashboard';

const QUEUE_ICON: Record<QueueKey, IconName> = { caregivers: 'userCheck', pets: 'paw', exceptions: 'alert', cases: 'messages', money_failed: 'card', money_late: 'clock' };

/** E14-1 A02 (round 57): server health and one card per queue, refreshed every minute. */
const health = ref<HealthReport | null>(null);
const queues = ref<QueueCount[]>([]);
const error = ref('');
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    [health.value, queues.value] = await Promise.all([fetchHealth(), getQueues()]);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(() => {
  void load();
  timer = setInterval(() => void load(), DASHBOARD_RULES.refreshSeconds * 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; max-width: 1100px; }
h2 { margin: 0; font-size: 26px; font-weight: 800; }
.note { color: var(--pp-muted); margin: 6px 0 24px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; max-width: 1100px; }
.card { display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 16px; border: 1px solid var(--pp-border); text-decoration: none; color: inherit; background: var(--pp-surface); box-shadow: var(--pp-shadow); transition: border-color 0.15s, transform 0.15s; }
.card:hover { border-color: var(--pp-primary-strong); transform: translateY(-1px); }
.tile { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: var(--pp-background); color: var(--pp-muted); margin-bottom: 4px; }
.count { font-size: 30px; font-weight: 800; line-height: 1.1; }
.label { font-weight: 600; }
.sub { font-size: 13px; color: var(--pp-muted); }
.quiet .count, .quiet .label { color: var(--pp-muted); }
.warning .tile { background: var(--pp-primary-soft); color: var(--pp-primary-strong); }
.warning .count { color: var(--pp-primary-strong); }
.danger { border-color: color-mix(in srgb, var(--pp-danger) 35%, var(--pp-surface)); background: color-mix(in srgb, var(--pp-danger) 6%, var(--pp-surface)); }
.danger .tile { background: color-mix(in srgb, var(--pp-danger) 14%, var(--pp-surface)); color: var(--pp-danger); }
.danger .count, .danger .sub { color: var(--pp-danger); }
.error { color: var(--pp-danger); }
</style>
