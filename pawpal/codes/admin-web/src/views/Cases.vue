<template>
  <div>
    <h2>Cases</h2>
    <el-alert
      type="info"
      :closable="false"
      title="Problems owners raised on a visit, before or after its report. While a case is open the whole order's payout is on hold; other visits go ahead. Decisions come in a later update."
      style="max-width: 1100px; margin-bottom: 16px"
    />
    <el-table :data="rows" data-test="cases" style="max-width: 1100px" empty-text="No cases">
      <el-table-column label="Order" width="170">
        <template #default="{ row }">{{ row.number }} · visit {{ row.visit }}</template>
      </el-table-column>
      <el-table-column label="Problem" width="140">
        <template #default="{ row }">{{ CASE_KIND_LABEL[row.kind as CaseKind] }}</template>
      </el-table-column>
      <el-table-column prop="description" label="Description" min-width="180" />
      <el-table-column prop="photos" label="Photos" width="80" />
      <el-table-column label="Status" width="140">
        <template #default="{ row }">
          <el-tag :type="row.status === 'sent' ? 'danger' : row.status === 'decided' ? 'success' : 'warning'" :data-test="`status-${row.id}`">{{ CASE_STATUS_LABEL[row.status as CaseStatus] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Payout" width="90">
        <template #default="{ row }"><span v-if="row.payoutHeld">On hold</span></template>
      </el-table-column>
      <el-table-column label="Sent" width="140">
        <template #default="{ row }">{{ row.createdAt.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="" width="140">
        <template #default="{ row }">
          <el-button v-if="row.status === 'sent'" size="small" type="primary" :data-test="`review-${row.id}`" @click="review(row.id)">Start review</el-button>
        </template>
      </el-table-column>
    </el-table>

    <h3 style="margin-top: 28px">Caregiver reports</h3>
    <el-alert type="info" :closable="false" title="Problems caregivers reported on a visit, with photos and their tries to reach the owner. Caregivers cannot set fault or take money. Decisions come in a later update." style="max-width: 1100px; margin-bottom: 16px" />
    <el-table :data="problems" data-test="problems" style="max-width: 1100px" empty-text="No reports">
      <el-table-column label="Order" width="160">
        <template #default="{ row }">{{ row.number }} · visit {{ row.visit }}</template>
      </el-table-column>
      <el-table-column prop="caregiver" label="Caregiver" width="100" />
      <el-table-column label="Problem" width="130">
        <template #default="{ row }">{{ PROBLEM_KIND_LABEL[row.kind as ProblemKind] }}</template>
      </el-table-column>
      <el-table-column prop="description" label="Description" min-width="150" />
      <el-table-column prop="photos" label="Photos" width="80" />
      <el-table-column prop="contacts" label="Tries" width="70" />
      <el-table-column label="Status" width="130">
        <template #default="{ row }">
          <el-tag :type="row.status === 'sent' ? 'danger' : 'warning'" :data-test="`problem-status-${row.id}`">{{ PROBLEM_STATUS_LABEL[row.status as ProblemStatus] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Sent" width="140">
        <template #default="{ row }">{{ row.createdAt.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="" width="120">
        <template #default="{ row }">
          <el-button v-if="row.status === 'sent'" size="small" type="primary" :data-test="`problem-review-${row.id}`" @click="reviewProblem(row.id)">Start review</el-button>
        </template>
      </el-table-column>
    </el-table>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  CASE_KIND_LABEL,
  CASE_STATUS_LABEL,
  PROBLEM_KIND_LABEL,
  PROBLEM_STATUS_LABEL,
  type AdminCaseRow,
  type AdminProblemRow,
  type CaseKind,
  type CaseStatus,
  type ProblemKind,
  type ProblemStatus,
} from '@pawpal/shared';
import { listCases, listProblems, startProblemReview, startReview } from '../api/cases';

const rows = ref<AdminCaseRow[]>([]);
const problems = ref<AdminProblemRow[]>([]);
const error = ref('');

async function reviewProblem(id: number) {
  try {
    problems.value = await startProblemReview(id);
    ElMessage.success('Review started. The caregiver was told.');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

async function review(id: number) {
  try {
    rows.value = await startReview(id);
    ElMessage.success('Review started. The owner was told.');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

onMounted(async () => {
  try {
    [rows.value, problems.value] = await Promise.all([listCases(), listProblems()]);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.error { color: var(--pp-danger); }
</style>
