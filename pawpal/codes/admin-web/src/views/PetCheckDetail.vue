<template>
  <div v-if="detail">
    <el-button link type="primary" data-test="back" @click="router.push('/pets')">‹ Pet check</el-button>
    <h2>{{ detail.pet.name }}</h2>

    <el-descriptions :column="1" border style="max-width: 720px" data-test="pet-detail">
      <el-descriptions-item label="Status">
        <el-tag data-test="detail-status">{{ PET_STATUS_LABEL[detail.pet.status] }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="Why checked">{{ reasonsText(detail.pet.checkReasons) }}</el-descriptions-item>
      <el-descriptions-item label="Type / breed">{{ petSummary(detail.pet, now) }}</el-descriptions-item>
      <el-descriptions-item label="Born">{{ detail.pet.birth.month }}/{{ detail.pet.birth.year }} ({{ ageText(detail.pet.birth, now) }})</el-descriptions-item>
      <el-descriptions-item label="Vaccine">
        {{ detail.pet.vaccinated && detail.pet.lastVaccine ? `Last ${detail.pet.lastVaccine.month}/${detail.pet.lastVaccine.year}` : 'Not vaccinated' }}
      </el-descriptions-item>
      <el-descriptions-item label="Vaccine card">
        <el-button v-if="detail.pet.hasVaccinePhoto && !photo" size="small" data-test="show-photo" @click="loadPhoto">Show photo</el-button>
        <span v-else-if="!detail.pet.hasVaccinePhoto">No photo sent</span>
        <img v-if="photo" :src="photo" alt="Vaccine card" class="photo" data-test="photo">
      </el-descriptions-item>
      <el-descriptions-item label="Health notes">{{ detail.pet.healthNote || '—' }}</el-descriptions-item>
      <el-descriptions-item label="Owner">{{ detail.ownerPhone }}</el-descriptions-item>
      <el-descriptions-item v-if="detail.pet.adminNote" label="Asked / reason">{{ detail.pet.adminNote }}</el-descriptions-item>
    </el-descriptions>

    <h3>History</h3>
    <el-table :data="detail.history" style="max-width: 900px" data-test="pet-history">
      <el-table-column prop="createdAt" label="When" width="200" />
      <el-table-column label="Change" width="260">
        <template #default="{ row }">{{ petStep(row) }}</template>
      </el-table-column>
      <el-table-column label="Who · why">
        <template #default="{ row }">{{ whoWhy(row) }}</template>
      </el-table-column>
    </el-table>

    <el-card v-if="inCheck" shadow="never" style="max-width: 720px; margin-top: 16px">
      <template #header>Decision</template>
      <el-radio-group v-model="decision" data-test="decision">
        <el-radio v-for="o in DECISION_OPTIONS" :key="o.value" :value="o.value" :data-test="`decision-${o.value}`">{{ o.label }}</el-radio>
      </el-radio-group>
      <el-input v-model="note" type="textarea" maxlength="300" show-word-limit :placeholder="hint.placeholder" style="margin-top: 12px" data-test="decision-note" />
      <p class="hint">The owner gets a message in the app. {{ hint.required ? 'They see this reason.' : '' }}</p>
      <el-button type="primary" :disabled="!decision || (hint.required && note.trim().length < 5)" data-test="submit-decision" @click="submit">Submit decision</el-button>
    </el-card>
    <p v-else class="hint" data-test="decided">This pet is not waiting for a check.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { PET_CHECK_STATUSES, PET_STATUS_LABEL, ageText, petSummary, type PetDecision } from '@pawpal/shared';
import { whoWhy } from '../api/history';
import { DECISION_OPTIONS, decidePet, fetchPetDetail, petPhotoUrl, petStep, reasonHint, reasonsText, type PetCheckDetail } from '../api/pets';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
const now = new Date();
const detail = ref<PetCheckDetail | null>(null);
const decision = ref<PetDecision | ''>('');
const note = ref('');
const photo = ref('');

const inCheck = computed(() => !!detail.value && PET_CHECK_STATUSES.includes(detail.value.pet.status));
const hint = computed(() => reasonHint(decision.value));

const load = async () => {
  detail.value = await fetchPetDetail(id);
};
onMounted(load);
onUnmounted(() => photo.value && URL.revokeObjectURL(photo.value));

async function loadPhoto() {
  photo.value = await petPhotoUrl(id);
}

async function submit() {
  if (!decision.value) return;
  try {
    const pet = await decidePet(id, decision.value, note.value);
    ElMessage.success(`${pet.name}: ${PET_STATUS_LABEL[pet.status]}. The owner has been told.`);
    decision.value = '';
    note.value = '';
    await load();
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<style scoped>
.hint { color: var(--el-text-color-secondary); }
.photo { display: block; max-width: 420px; max-height: 320px; margin-top: 8px; border-radius: 6px; }
</style>
