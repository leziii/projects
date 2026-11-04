<template>
  <div>
    <h2>Dashboard</h2>
    <el-tag :type="health?.status === 'ok' ? 'success' : 'danger'" data-test="health">
      {{ healthLabel(health) }}
    </el-tag>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { HealthReport } from '@pawpal/shared';
import { fetchHealth, healthLabel } from '../api/health';

const health = ref<HealthReport | null>(null);
onMounted(async () => {
  health.value = await fetchHealth();
});
</script>
