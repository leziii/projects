<template>
  <div>
    <h2>Dashboard</h2>
    <el-tag :type="health?.status === 'ok' ? 'success' : 'danger'" data-test="health">
      {{ healthLabel(health) }}
    </el-tag>
    <p class="note" data-test="dashboard-note">{{ DASHBOARD_NOTE }}</p>
    <div class="cards" data-test="queues">
      <router-link v-for="q in queues" :key="q.key" :to="QUEUE_INFO[q.key].path" class="card" :class="queueTone(q)" :data-test="`queue-${q.key}`">
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
import { DASHBOARD_NOTE, DASHBOARD_RULES, QUEUE_INFO, queueCountText, queueTone, type HealthReport, type QueueCount } from '@pawpal/shared';
import { fetchHealth, healthLabel } from '../api/health';
import { getQueues } from '../api/dashboard';

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
.note { color: var(--el-text-color-secondary); margin: 16px 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; max-width: 1100px; }
.card { display: block; padding: 16px; border-radius: 8px; border: 1px solid var(--el-border-color); text-decoration: none; color: inherit; background: var(--el-bg-color); }
.card:hover { border-color: var(--el-color-primary); }
.count { font-size: 32px; font-weight: 700; line-height: 1.1; }
.label { font-weight: 600; margin-top: 4px; }
.sub { font-size: 13px; color: var(--el-text-color-secondary); margin-top: 2px; }
.quiet .count, .quiet .label { color: var(--el-text-color-placeholder); }
.warning { border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.warning .count { color: var(--el-color-warning-dark-2); }
.danger { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.danger .count { color: var(--el-color-danger); }
.error { color: var(--el-color-danger); }
</style>
