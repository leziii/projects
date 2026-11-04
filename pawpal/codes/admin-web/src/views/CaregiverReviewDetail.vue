<template>
  <div v-if="detail">
    <el-button link type="primary" data-test="back" @click="router.push('/caregivers')">‹ Caregiver review</el-button>
    <h2>{{ app.fullName || 'No name yet' }}</h2>

    <el-alert v-if="detail.sameIc.length" type="error" :closable="false" show-icon style="max-width: 720px; margin-bottom: 12px" data-test="same-ic">
      Same IC number as {{ detail.sameIc.map((a) => `${a.phone} (${APPLICATION_STATUS_LABEL[a.status]})`).join(', ') }}
    </el-alert>

    <el-descriptions :column="1" border style="max-width: 720px" data-test="app-detail">
      <el-descriptions-item label="Status">
        <el-tag data-test="detail-status">{{ APPLICATION_STATUS_LABEL[app.status] }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="Phone">{{ detail.phone }}</el-descriptions-item>
      <el-descriptions-item label="IC number">
        <span data-test="ic">{{ fullIc || app.icNumber || '—' }}</span>
        <el-button v-if="app.icNumber && !fullIc" size="small" style="margin-left: 8px" data-test="show-ic" @click="revealIc">Show</el-button>
        <div v-if="!fullIc" class="hint">Showing the full number is recorded.</div>
      </el-descriptions-item>
      <el-descriptions-item v-for="k in ID_FILES" :key="k" :label="APPLICATION_FILE_LABEL[k]">
        <PhotoList :kind="k" />
      </el-descriptions-item>
      <el-descriptions-item label="Experience">{{ ageOfExperience(app.experienceYears) }}</el-descriptions-item>
      <el-descriptions-item label="Cares for">{{ caresFor }}</el-descriptions-item>
      <el-descriptions-item label="Areas">{{ app.areas.join(', ') || '—' }}</el-descriptions-item>
      <el-descriptions-item label="Care guide">{{ app.guideRead ? 'Read' : 'Not read' }}</el-descriptions-item>
      <el-descriptions-item v-for="k in OPTIONAL_FILES" :key="k" :label="APPLICATION_FILE_LABEL[k]">
        <PhotoList :kind="k" />
      </el-descriptions-item>
      <el-descriptions-item v-if="app.adminNote" label="Last reason sent">{{ app.adminNote }}</el-descriptions-item>
    </el-descriptions>

    <h3>History</h3>
    <el-table :data="detail.history" style="max-width: 900px" data-test="app-history">
      <el-table-column prop="createdAt" label="When" width="200" />
      <el-table-column label="Change" width="260">
        <template #default="{ row }">{{ appStep(row) }}</template>
      </el-table-column>
      <el-table-column label="Who · why">
        <template #default="{ row }">{{ whoWhy(row) }}</template>
      </el-table-column>
    </el-table>
    <p v-if="detail.icViews.length" class="hint" data-test="ic-views">
      Full IC shown: {{ detail.icViews.map((v) => `${v.actorId} at ${v.createdAt}`).join('; ') }}
    </p>

    <el-card v-if="app.status === 'submitted'" shadow="never" style="max-width: 720px; margin-top: 16px">
      <template #header>Decision</template>
      <el-checkbox v-model="idChecked" data-test="id-checked">IC photos and selfie match the name and IC number</el-checkbox>
      <el-checkbox v-if="hasCertificates" v-model="certChecked" data-test="cert-checked">Certificates checked</el-checkbox>
      <div style="margin-top: 12px">
        <el-radio-group v-model="decision" data-test="decision">
          <el-radio v-for="o in APP_DECISION_OPTIONS" :key="o.value" :value="o.value" :data-test="`decision-${o.value}`">{{ o.label }}</el-radio>
        </el-radio-group>
      </div>
      <el-input v-model="note" type="textarea" :maxlength="APP_NOTE_MAX" show-word-limit :placeholder="placeholder" style="margin-top: 12px" data-test="decision-note" />
      <p class="hint" data-test="decision-hint">{{ block || 'The caregiver gets a message in the app.' }}</p>
      <el-button type="primary" :disabled="!!block" data-test="submit-decision" @click="submit">Submit decision</el-button>
    </el-card>
    <p v-else class="hint" data-test="decided">This application is not waiting for review.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElButton, ElMessage } from 'element-plus';
import { APPLICATION_FILE_LABEL, APPLICATION_STATUS_LABEL, APP_NOTE_MAX, DOG_SIZE_LABEL, type AppDecision, type ApplicationFileKind } from '@pawpal/shared';
import { whoWhy } from '../api/history';
import { APP_DECISION_OPTIONS, ageOfExperience, appStep, decideApplication, decisionBlock, fetchReviewDetail, reviewFileUrl, showFullIc, type ReviewDetail } from '../api/caregivers';

const ID_FILES: ApplicationFileKind[] = ['ic_front', 'ic_back', 'selfie'];
const OPTIONAL_FILES: ApplicationFileKind[] = ['certificate', 'good_conduct'];

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
const detail = ref<ReviewDetail | null>(null);
const fullIc = ref('');
const photos = ref<Record<number, string>>({});
const decision = ref<AppDecision | ''>('');
const note = ref('');
const idChecked = ref(false);
const certChecked = ref(false);

const app = computed(() => detail.value!.application);
const hasCertificates = computed(() => app.value.files.some((f) => f.kind === 'certificate' || f.kind === 'good_conduct'));
const caresFor = computed(() => {
  const a = app.value;
  const parts = [a.cats ? 'Cats' : '', a.dogs ? `Dogs up to ${a.maxDogSize ? DOG_SIZE_LABEL[a.maxDogSize] : '—'}` : ''].filter(Boolean);
  return parts.join(' · ') || '—';
});
const block = computed(() => decisionBlock({ status: decision.value, note: note.value, idChecked: idChecked.value }, detail.value?.sameIc ?? []));
const placeholder = computed(() =>
  decision.value === 'approved' ? 'Optional internal note (the caregiver does not see it)' : 'Required. The caregiver sees this, so write it for them',
);

const load = async () => {
  detail.value = await fetchReviewDetail(id);
};
onMounted(load);
onUnmounted(() => Object.values(photos.value).forEach((u) => URL.revokeObjectURL(u)));

async function revealIc() {
  fullIc.value = (await showFullIc(id)).icNumber;
  await load();
}

async function showPhoto(fileId: number) {
  photos.value = { ...photos.value, [fileId]: await reviewFileUrl(id, fileId) };
}

async function submit() {
  if (!decision.value) return;
  try {
    const d = await decideApplication(id, { status: decision.value, note: note.value, idChecked: idChecked.value, certChecked: certChecked.value });
    ElMessage.success(`${d.application.fullName}: ${APPLICATION_STATUS_LABEL[d.application.status]}. The caregiver has been told.`);
    detail.value = d;
    decision.value = '';
    note.value = '';
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

/** The photos of one kind: a Show button each, then the image. */
const PhotoList = defineComponent({
  props: { kind: { type: String, required: true } },
  setup(props) {
    return () => {
      const files = app.value.files.filter((f) => f.kind === props.kind);
      if (!files.length) return h('span', 'None');
      return h(
        'div',
        { class: 'photos' },
        files.map((f) =>
          photos.value[f.id]
            ? h('img', { src: photos.value[f.id], alt: APPLICATION_FILE_LABEL[f.kind], class: 'photo', 'data-test': `photo-${f.kind}` })
            : h(ElButton, { size: 'small', 'data-test': `show-${f.kind}`, onClick: () => showPhoto(f.id) }, () => 'Show photo'),
        ),
      );
    };
  },
});
</script>

<style scoped>
.hint { color: var(--el-text-color-secondary); }
.photos { display: flex; flex-wrap: wrap; gap: 8px; }
.photo { display: block; max-width: 320px; max-height: 240px; border-radius: 6px; }
</style>
