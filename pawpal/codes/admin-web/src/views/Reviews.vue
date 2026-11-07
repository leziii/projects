<template>
  <div>
    <h2>Reviews</h2>
    <el-alert
      type="info"
      :closable="false"
      title="Owner reviews of caregivers. Hiding a review removes it from the caregiver's profile and average. Every hide is logged with your reason. Reviews do not affect payout."
      style="max-width: 1100px; margin-bottom: 16px"
    />
    <el-table :data="rows" data-test="reviews" style="max-width: 1100px" empty-text="No reviews">
      <el-table-column prop="number" label="Order" width="150" />
      <el-table-column prop="caregiver" label="Caregiver" width="140" />
      <el-table-column label="Stars" width="120">
        <template #default="{ row }"><span class="stars">{{ starsText(row.stars) }}</span></template>
      </el-table-column>
      <el-table-column label="Comment" min-width="240">
        <template #default="{ row }">
          <div>{{ row.comment || '—' }}</div>
          <div class="who">by {{ row.ownerName }}<template v-if="row.reply"> · Reply: {{ row.reply }}</template></div>
        </template>
      </el-table-column>
      <el-table-column label="Sent" width="150">
        <template #default="{ row }">{{ row.createdAt.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="" width="200">
        <template #default="{ row }">
          <template v-if="row.hidden">
            <el-tag type="info" :data-test="`hidden-${row.id}`">Hidden</el-tag>
            <div class="who">{{ row.hiddenReason }}</div>
          </template>
          <el-button v-else size="small" type="danger" plain :data-test="`hide-${row.id}`" @click="hide(row.id)">Hide</el-button>
        </template>
      </el-table-column>
    </el-table>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { starsText, type AdminReviewRow } from '@pawpal/shared';
import { hideReview, listReviews } from '../api/reviews';

const rows = ref<AdminReviewRow[]>([]);
const error = ref('');

async function hide(id: number) {
  let reason: string;
  try {
    ({ value: reason } = await ElMessageBox.prompt('Why hide this review? The reason is logged.', 'Hide review', { confirmButtonText: 'Hide', inputPlaceholder: 'Reason' }));
  } catch {
    return; // Cancelled.
  }
  try {
    rows.value = await hideReview(id, reason);
    ElMessage.success('Review hidden');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

onMounted(async () => {
  try {
    rows.value = await listReviews();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.error { color: var(--pp-danger); }
.stars { color: var(--pp-accent); letter-spacing: 1px; }
.who { color: var(--pp-muted); font-size: 13px; margin-top: 2px; }
</style>
