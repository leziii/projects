<template>
  <div>
    <h2>Location flags</h2>
    <el-alert
      type="info"
      :closable="false"
      :title="`The caregiver's location is saved only at I've arrived and Report sent. Listed here when more than ${LOCATION_RULES.flagMeters} m from the home position, not shared, or the address has no home position. Nothing is blocked.`"
      style="max-width: 1000px; margin-bottom: 16px"
    />
    <el-table :data="rows" data-test="flags" style="max-width: 1000px" empty-text="No location flags">
      <el-table-column label="Order" width="170">
        <template #default="{ row }">{{ row.number }} · visit {{ row.visit }}</template>
      </el-table-column>
      <el-table-column prop="caregiver" label="Caregiver" min-width="140" />
      <el-table-column label="Moment" width="130">
        <template #default="{ row }">{{ LOCATION_MOMENT_LABEL[row.moment as LocationMoment] }}</template>
      </el-table-column>
      <el-table-column label="Flag" min-width="200">
        <template #default="{ row }">
          <el-tag :type="row.flag === 'far' ? 'danger' : 'warning'" :data-test="`flag-${row.id}`">{{ flagText(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Time" width="170">
        <template #default="{ row }">{{ row.at.slice(0, 16) }}</template>
      </el-table-column>
    </el-table>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LOCATION_FLAG_LABEL, LOCATION_MOMENT_LABEL, LOCATION_RULES, distanceText, type LocationFlagRow, type LocationMoment } from '@pawpal/shared';
import { locationFlags } from '../api/locations';

const rows = ref<LocationFlagRow[]>([]);
const error = ref('');

/** "Far from the address · 1.1 km" */
const flagText = (r: LocationFlagRow) => (r.distanceM === null ? LOCATION_FLAG_LABEL[r.flag] : `${LOCATION_FLAG_LABEL[r.flag]} · ${distanceText(r.distanceM)}`);

onMounted(async () => {
  try {
    rows.value = await locationFlags();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.error { color: var(--pp-danger); }
</style>
