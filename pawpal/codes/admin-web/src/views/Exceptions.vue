<template>
  <div>
    <h2>Exceptions</h2>
    <el-alert
      type="info"
      :closable="false"
      title="Problems raised before a visit's report, by the caregiver or the owner. Open one to see both sides and decide. Disputes on a sent report are on Cases."
      style="max-width: 1100px; margin-bottom: 16px"
    />
    <el-table :data="rows" data-test="exceptions" style="max-width: 1100px" empty-text="No exceptions" @row-click="open">
      <el-table-column label="Order" width="150" prop="number" />
      <el-table-column label="Visit" width="230">
        <template #default="{ row }">{{ exceptionVisitText(row) }}</template>
      </el-table-column>
      <el-table-column label="From" width="100">
        <template #default="{ row }">{{ FROM_LABEL[row.from as AdminExceptionRow['from']] }}</template>
      </el-table-column>
      <el-table-column label="Problem" min-width="200">
        <template #default="{ row }">{{ row.kinds.join(' · ') }}</template>
      </el-table-column>
      <el-table-column label="Status" width="230">
        <template #default="{ row }">
          <el-tag :type="row.status === 'open' ? 'danger' : row.status === 'offered' ? 'warning' : 'success'" :data-test="`exception-status-${row.orderId}-${row.index}`">{{ exceptionStatusText(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="" width="100">
        <template #default="{ row }">
          <el-button size="small" :type="row.status === 'open' ? 'primary' : 'default'" :data-test="`exception-open-${row.orderId}-${row.index}`" @click.stop="open(row)">{{ row.status === 'open' ? 'Handle' : 'View' }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AdminExceptionRow } from '@pawpal/shared';
import { FROM_LABEL, exceptionStatusText, exceptionVisitText, listExceptions } from '../api/exceptions';

/** E12-3 A09 (R51-1): the exception queue; open ones first. */
const router = useRouter();
const rows = ref<AdminExceptionRow[]>([]);
const error = ref('');

const open = (r: AdminExceptionRow) => void router.push(`/exceptions/${r.orderId}/${r.index}`);

onMounted(async () => {
  try {
    rows.value = await listExceptions();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.error { color: var(--el-color-danger); }
:deep(.el-table__row) { cursor: pointer; }
</style>
