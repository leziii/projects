<template>
  <div>
    <h2>Caregiver review</h2>
    <el-radio-group v-model="filter" data-test="review-filter" @change="load">
      <el-radio-button v-for="s in REVIEW_FILTERS" :key="s" :value="s" :data-test="`filter-${s}`">{{ REVIEW_FILTER_LABEL[s] }}</el-radio-button>
      <el-radio-button value="changes" data-test="filter-changes">Profile changes</el-radio-button>
    </el-radio-group>
    <p class="hint">Oldest first.</p>
    <el-table v-if="filter === 'changes'" :data="changes" data-test="change-list" style="max-width: 1100px" empty-text="No profile changes waiting" @row-click="openChange">
      <el-table-column prop="displayName" label="Caregiver" min-width="160" />
      <el-table-column prop="phone" label="Phone" width="170" />
      <el-table-column prop="summary" label="Asked for" min-width="260" />
      <el-table-column prop="createdAt" label="Sent" width="190" />
      <el-table-column width="110">
        <template #default="{ row }">
          <el-button size="small" type="primary" :data-test="`change-${row.userId}`" @click.stop="openChange(row)">Review</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-table v-else :data="rows" data-test="review-list" style="max-width: 1100px" empty-text="No applications" @row-click="open">
      <el-table-column prop="fullName" label="Applicant" min-width="180" />
      <el-table-column prop="phone" label="Phone" width="170" />
      <el-table-column prop="submittedAt" label="Sent" width="190" />
      <el-table-column label="Documents" min-width="200">
        <template #default="{ row }">
          {{ row.documents }}
          <el-tag v-if="row.sameIc" type="danger" size="small" :data-test="`same-ic-${row.userId}`">Same IC as another account</el-tag>
        </template>
      </el-table-column>
      <el-table-column width="110">
        <template #default="{ row }">
          <el-button size="small" type="primary" :data-test="`review-${row.userId}`" @click.stop="open(row)">{{ row.status === 'submitted' ? 'Review' : 'View' }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { REVIEW_FILTERS, REVIEW_FILTER_LABEL, type ApplicationStatus, type ChangeRow, type ReviewRow } from '@pawpal/shared';
import { fetchChangeList, fetchReviewList } from '../api/caregivers';

const router = useRouter();
const route = useRoute();
const filter = ref<ApplicationStatus | 'changes'>(route.query.filter === 'changes' ? 'changes' : 'submitted');
const rows = ref<ReviewRow[]>([]);
const changes = ref<ChangeRow[]>([]);

const load = async () => {
  if (filter.value === 'changes') changes.value = await fetchChangeList();
  else rows.value = await fetchReviewList(filter.value);
};
onMounted(load);

function open(row: ReviewRow) {
  void router.push(`/caregivers/${row.userId}`);
}

function openChange(row: ChangeRow) {
  void router.push(`/caregivers/${row.userId}/change`);
}
</script>

<style scoped>
.hint { color: var(--el-text-color-secondary); }
</style>
