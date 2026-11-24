<template>
  <div>
    <h2>Funnel</h2>
    <p class="muted">{{ FUNNEL_NOTE }}</p>
    <el-radio-group v-model="days" data-test="funnel-days" @change="load">
      <el-radio-button v-for="d in MONITOR_RULES.funnelDays" :key="d" :value="d">Last {{ d }} days</el-radio-button>
    </el-radio-group>
    <p v-if="report" class="muted" data-test="funnel-range">{{ report.from }} to {{ report.to }}</p>

    <el-table v-if="report" :data="report.steps" data-test="funnel-steps" style="max-width: 760px; margin-top: 8px">
      <el-table-column label="Step" prop="label" min-width="200" />
      <el-table-column label="People" width="110" prop="count" />
      <el-table-column label="Of step before" width="140">
        <template #default="{ row }">{{ ofPreviousText(row.ofPrevious) }}</template>
      </el-table-column>
      <el-table-column label="" min-width="220">
        <template #default="{ row }">
          <el-progress :percentage="barOf(row.count)" :show-text="false" :stroke-width="12" />
        </template>
      </el-table-column>
    </el-table>

    <h3>By day</h3>
    <el-table v-if="report" :data="[...report.byDay].reverse()" data-test="funnel-days-table" style="max-width: 760px" max-height="420">
      <el-table-column label="Day" prop="day" width="130" />
      <el-table-column v-for="s in FUNNEL_STEPS" :key="s" :label="FUNNEL_STEP_LABEL[s]" min-width="110">
        <template #default="{ row }">{{ row.counts[s] }}</template>
      </el-table-column>
    </el-table>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FUNNEL_NOTE, FUNNEL_STEPS, FUNNEL_STEP_LABEL, MONITOR_RULES, type FunnelReport } from '@pawpal/shared';
import { fetchFunnel, ofPreviousText } from '../api/funnel';

/** E15-3 (R61-4): home → setup → caregiver chosen → pay page → paid, for the last 7 or 30 days. */
const days = ref<7 | 30>(7);
const report = ref<FunnelReport | null>(null);
const error = ref('');

const barOf = (n: number) => {
  const top = report.value?.steps[0]?.count ?? 0;
  return top ? Math.min(100, Math.round((n / top) * 100)) : 0;
};

async function load() {
  try {
    report.value = await fetchFunnel(days.value);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(load);
</script>

<style scoped>
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.error { color: var(--el-color-danger); }
</style>
