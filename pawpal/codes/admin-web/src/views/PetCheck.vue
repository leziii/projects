<template>
  <div>
    <h2>Pet check</h2>
    <p class="hint">Pets waiting for a check, and pets waiting for the owner to add information. Oldest first.</p>
    <el-table :data="rows" data-test="pet-queue" style="max-width: 1100px" empty-text="Nothing to check" @row-click="open">
      <el-table-column label="Pet" min-width="200">
        <template #default="{ row }">
          <strong>{{ row.name }}</strong>
          <div class="sub">{{ row.summary }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="ownerPhone" label="Owner" width="170" />
      <el-table-column label="Why" min-width="200">
        <template #default="{ row }">{{ reasonsText(row.checkReasons) }}</template>
      </el-table-column>
      <el-table-column label="Status" width="170">
        <template #default="{ row }">
          <el-tag :type="row.status === 'pending' ? 'warning' : 'info'" :data-test="`queue-status-${row.id}`">{{ PET_STATUS_LABEL[row.status as PetStatus] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="Updated" width="190" />
      <el-table-column width="110">
        <template #default="{ row }">
          <el-button size="small" type="primary" :data-test="`check-${row.id}`" @click.stop="open(row)">{{ row.status === 'pending' ? 'Check' : 'View' }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { PET_STATUS_LABEL, type PetCheckRow, type PetStatus } from '@pawpal/shared';
import { fetchPetQueue, reasonsText } from '../api/pets';

const router = useRouter();
const rows = ref<PetCheckRow[]>([]);

onMounted(async () => {
  rows.value = await fetchPetQueue();
});

function open(row: PetCheckRow) {
  void router.push(`/pets/${row.id}`);
}
</script>

<style scoped>
.hint { color: var(--el-text-color-secondary); }
.sub { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
