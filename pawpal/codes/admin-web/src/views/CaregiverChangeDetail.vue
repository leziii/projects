<template>
  <div v-if="detail">
    <el-button link type="primary" data-test="back" @click="router.push('/caregivers?filter=changes')">‹ Profile changes</el-button>
    <h2>{{ detail.displayName }} · profile change</h2>

    <el-descriptions :column="1" border style="max-width: 720px" data-test="change-detail">
      <el-descriptions-item label="Phone">{{ detail.phone }}</el-descriptions-item>
      <el-descriptions-item v-if="detail.change.ability" label="Dogs now">{{ detail.current }}</el-descriptions-item>
      <el-descriptions-item v-if="detail.change.ability" label="Asked for">
        <strong data-test="asked-ability">{{ abilityText(detail.change.ability) }}</strong>
      </el-descriptions-item>
      <el-descriptions-item v-if="detail.change.photo" label="New photo">
        <div class="photos">
          <figure>
            <img v-if="photos.pending" :src="photos.pending" alt="New photo" class="photo" data-test="pending-photo">
            <figcaption>New photo</figcaption>
          </figure>
          <figure v-if="photos.selfie">
            <img :src="photos.selfie" alt="IC selfie" class="photo" data-test="selfie-photo">
            <figcaption>Selfie with IC (application)</figcaption>
          </figure>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="Sent">{{ detail.change.createdAt }}</el-descriptions-item>
    </el-descriptions>

    <h3>History</h3>
    <el-table :data="detail.history" style="max-width: 900px" data-test="change-history">
      <el-table-column prop="createdAt" label="When" width="200" />
      <el-table-column prop="toStatus" label="Result" width="140" />
      <el-table-column label="Who · why">
        <template #default="{ row }">{{ whoWhy(row) }}</template>
      </el-table-column>
    </el-table>

    <el-card shadow="never" style="max-width: 720px; margin-top: 16px">
      <template #header>Decision</template>
      <el-radio-group v-model="decision" data-test="decision">
        <el-radio value="approved" data-test="decision-approved">Approve</el-radio>
        <el-radio value="rejected" data-test="decision-rejected">Not approved</el-radio>
      </el-radio-group>
      <el-input
        v-model="note"
        type="textarea"
        :maxlength="APP_NOTE_MAX"
        show-word-limit
        :placeholder="decision === 'rejected' ? 'Required. The caregiver sees this' : 'Optional internal note'"
        style="margin-top: 12px"
        data-test="decision-note"
      />
      <p class="hint" data-test="decision-hint">{{ block || 'The caregiver gets a message in the app.' }}</p>
      <el-button type="primary" :disabled="!!block" data-test="submit-decision" @click="submit">Submit decision</el-button>
    </el-card>
  </div>
  <p v-else-if="gone" class="hint" data-test="no-change">No profile change is waiting for this caregiver.</p>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { APP_NOTE_MAX, abilityText, type ChangeDecision } from '@pawpal/shared';
import { whoWhy } from '../api/history';
import { changeBlock, changePhotoUrl, decideChange, fetchChangeDetail, reviewFileUrl, type ChangeDetail } from '../api/caregivers';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
const detail = ref<ChangeDetail | null>(null);
const gone = ref(false);
const photos = ref<{ pending?: string; selfie?: string }>({});
const decision = ref<ChangeDecision | ''>('');
const note = ref('');

const block = computed(() => changeBlock(decision.value, note.value));

onMounted(async () => {
  try {
    detail.value = await fetchChangeDetail(id);
  } catch {
    gone.value = true;
    return;
  }
  // The new photo next to the IC selfie, to check it is the same person (R15-3).
  if (detail.value.change.photo) {
    photos.value = {
      pending: await changePhotoUrl(id, 'pending'),
      selfie: detail.value.selfieFileId ? await reviewFileUrl(id, detail.value.selfieFileId) : undefined,
    };
  }
});
onUnmounted(() => Object.values(photos.value).forEach((u) => u && URL.revokeObjectURL(u)));

async function submit() {
  if (!decision.value) return;
  try {
    await decideChange(id, decision.value, note.value);
    ElMessage.success(`${decision.value === 'approved' ? 'Approved' : 'Not approved'}. The caregiver has been told.`);
    void router.push('/caregivers?filter=changes');
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<style scoped>
.hint { color: var(--el-text-color-secondary); }
.photos { display: flex; gap: 16px; flex-wrap: wrap; }
figure { margin: 0; }
figcaption { color: var(--el-text-color-secondary); font-size: 12px; }
.photo { display: block; max-width: 260px; max-height: 220px; border-radius: 6px; }
</style>
