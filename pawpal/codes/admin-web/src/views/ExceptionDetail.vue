<template>
  <div v-if="d">
    <el-button link type="primary" data-test="back" @click="router.push('/exceptions')">‹ Exceptions</el-button>
    <h2>{{ d.number }} · visit {{ d.index + 1 }}</h2>

    <el-descriptions :column="2" border style="max-width: 1000px" data-test="visit-facts">
      <el-descriptions-item label="Visit">{{ visitWhen(d) }}</el-descriptions-item>
      <el-descriptions-item label="Caregiver">{{ d.caregiver }}</el-descriptions-item>
      <el-descriptions-item label="Paid for this visit">{{ formatRM(d.paidSen) }}</el-descriptions-item>
      <el-descriptions-item label="Visit status"><span data-test="run-status">{{ TASK_STATUS_LABEL[d.run.status] }}</span></el-descriptions-item>
      <el-descriptions-item label="Arrived">{{ at(d.run.arrivedAt) }}</el-descriptions-item>
      <el-descriptions-item label="Let in">{{ at(d.run.enteredAt) }}</el-descriptions-item>
      <el-descriptions-item label="Waiting asked">{{ at(d.run.waitingAt) }}</el-descriptions-item>
      <el-descriptions-item label="Location">{{ d.run.locationFlag ? 'Over 500 m from home' : 'No flag' }}</el-descriptions-item>
    </el-descriptions>

    <div class="sides">
      <el-card shadow="never" class="side" data-test="caregiver-side">
        <template #header>Caregiver</template>
        <template v-if="d.caregiverReport">
          <p class="kind" data-test="cg-kind">{{ d.caregiverReport.kind }} <span class="muted">· {{ at(d.caregiverReport.createdAt) }}</span></p>
          <p class="text" data-test="cg-description">{{ d.caregiverReport.description }}</p>
          <div class="photos">
            <img v-for="p in d.caregiverReport.photos" :key="p" :src="urls[`problem-${p}`]" alt="Caregiver photo" class="photo" data-test="cg-photo">
          </div>
          <p class="label">Tries to reach the owner</p>
          <p v-for="c in d.caregiverReport.contacts" :key="c.id" class="line" data-test="cg-contact">{{ contactLine(c) }}</p>
          <p v-if="!d.caregiverReport.contacts.length" class="muted">None</p>
        </template>
        <p v-else class="muted" data-test="cg-none">The caregiver did not report.</p>
      </el-card>
      <el-card shadow="never" class="side" data-test="owner-side">
        <template #header>Owner</template>
        <template v-if="d.ownerCase">
          <p class="kind" data-test="owner-kind">{{ d.ownerCase.kind }} <span class="muted">· {{ at(d.ownerCase.createdAt) }}</span></p>
          <p class="text" data-test="owner-description">{{ d.ownerCase.description }}</p>
          <div class="photos">
            <img v-for="p in d.ownerCase.photos" :key="p" :src="urls[`case-${p}`]" alt="Owner photo" class="photo" data-test="owner-photo">
          </div>
          <p class="label">Notes</p>
          <p v-for="(n, k) in d.ownerCase.notes" :key="k" class="line" data-test="owner-note">{{ n.body }} <span class="muted">· {{ at(n.at) }}</span></p>
          <p v-if="!d.ownerCase.notes.length" class="muted">None</p>
        </template>
        <p v-else class="muted" data-test="owner-none">The owner did not report.</p>
      </el-card>
    </div>

    <el-card v-if="d.substitute" shadow="never" style="max-width: 1000px; margin-top: 16px" data-test="substitute">
      <template #header>Substitute · <span data-test="sub-status">{{ SUBSTITUTE_STATUS_LABEL[d.substitute.status] }}</span></template>
      <p class="kind" data-test="sub-caregiver">{{ d.substitute.caregiver.displayName }} <span class="muted">instead of {{ d.substitute.from }}</span></p>
      <p v-for="v in d.substitute.visits" :key="v.index" class="line" data-test="sub-line">Visit {{ v.index + 1 }} · {{ substituteVisitText(v) }}</p>
      <p class="text muted" data-test="sub-reason-text">Reason: {{ d.substitute.reason }}</p>
      <p v-if="d.substitute.status === 'waiting'" class="muted" data-test="sub-answer-by">Owner answers by {{ at(d.substitute.answerBy) }}. If not, it counts as declined and the visits are refunded in full.</p>
      <p v-if="d.substitute.newOrder" class="muted" data-test="sub-new-order">New order {{ d.substitute.newOrder.number }}</p>
    </el-card>

    <el-card v-if="d.decision" shadow="never" style="max-width: 1000px; margin-top: 16px" data-test="decided">
      <template #header>Decision</template>
      <p class="kind" data-test="decided-text">{{ decisionText({ fault: d.decision.fault, refundSen: d.decision.refundSen, reason: d.decision.reason }) }}</p>
      <p class="muted">By {{ d.decision.admin }} · {{ at(d.decision.at) }}<span v-if="d.decision.creditSen"> · {{ formatRM(d.decision.creditSen) }} of it back as credit</span></p>
    </el-card>

    <el-card v-else-if="canDecide" shadow="never" style="max-width: 1000px; margin-top: 16px" data-test="decide">
      <template #header>Decision</template>
      <el-radio-group v-model="fault" class="faults" data-test="fault" @change="onFault">
        <el-radio v-for="f in FAULTS" :key="f" :value="f" :data-test="`fault-${f}`">{{ FAULT_LABEL[f] }}</el-radio>
        <el-radio value="substitute" :disabled="!canOffer" data-test="fault-substitute">Needs substitute</el-radio>
      </el-radio-group>
      <SubstituteForm v-if="fault === 'substitute'" :detail="d" @sent="reload" />
      <template v-else>
        <div v-if="fault" class="refund">
          <span>Refund for this visit</span>
          <el-input-number v-model="percent" :min="0" :max="maxRefundPercent(fault)" :step="10" data-test="refund-percent" />
          <span>%</span>
          <span class="muted" data-test="refund-preview">= {{ refundPreview(d.paidSen, percent ?? 0) }}</span>
        </div>
        <p v-if="fault === 'owner'" class="muted" data-test="split-note">No refund. The visit fee is split 50/50 between the caregiver and PawPal.</p>
        <el-input v-model="reason" type="textarea" :maxlength="DECISION_RULES.reasonMax" show-word-limit placeholder="Reason (both sides see it)" style="margin-top: 12px" data-test="reason" />
        <p class="hint" data-test="decision-hint">{{ problem || 'Both sides get a message. The visit is closed and any refund starts now.' }}</p>
        <el-button type="primary" :disabled="!!problem || busy" data-test="submit-decision" @click="submit">Submit decision</el-button>
      </template>
    </el-card>
  </div>
  <p v-else-if="error" class="error" data-test="error">{{ error }}</p>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  DECISION_RULES,
  FAULTS,
  FAULT_LABEL,
  SUBSTITUTE_STATUS_LABEL,
  TASK_STATUS_LABEL,
  canMove,
  decisionProblem,
  decisionText,
  defaultRefundPercent,
  formatRM,
  klAtText,
  maxRefundPercent,
  substituteVisitText,
  visitWhen,
  type ExceptionDetail,
  type Fault,
} from '@pawpal/shared';
import { contactLine, decideException, exceptionPhotoUrl, getException, refundPreview } from '../api/exceptions';
import SubstituteForm from '../components/SubstituteForm.vue';

/** E12-3 A10 (R51-2 … R51-5): both sides' evidence, then fault, refund and a required reason. E12-4: or a substitute. */
const route = useRoute();
const router = useRouter();
const orderId = Number(route.params.orderId);
const index = Number(route.params.i);
const d = ref<ExceptionDetail | null>(null);
const error = ref('');
const busy = ref(false);
const fault = ref<Fault | 'substitute' | ''>('');
const percent = ref<number | undefined>(0);
const reason = ref('');
const urls = reactive<Record<string, string>>({});
const problem = computed(() => (fault.value === 'substitute' ? '' : decisionProblem({ fault: fault.value, refundPercent: percent.value, reason: reason.value })));
/** R52-1: no decision while the owner is asked; a visit that moved is done. */
const canDecide = computed(() => !!d.value && d.value.substitute?.status !== 'waiting' && d.value.run.status !== 'moved');
/** R52-2: a substitute only for visits not started; one offer per order. */
const canOffer = computed(() => !!d.value && !d.value.substitute && d.value.visits.some((v) => canMove(v.status)));

const at = (t: string | null) => (t ? klAtText(t) : '—');
const onFault = () => (percent.value = fault.value && fault.value !== 'substitute' ? defaultRefundPercent(fault.value) : 0);

function show(x: ExceptionDetail) {
  d.value = x;
  const load = (kind: 'problem' | 'case', id: number) => {
    const key = `${kind}-${id}`;
    if (!urls[key]) exceptionPhotoUrl(kind, id).then((u) => (urls[key] = u)).catch(() => undefined);
  };
  x.caregiverReport?.photos.forEach((p) => load('problem', p));
  x.ownerCase?.photos.forEach((p) => load('case', p));
}

async function reload() {
  fault.value = '';
  show(await getException(orderId, index));
}

async function submit() {
  if (problem.value || !fault.value || fault.value === 'substitute' || !d.value) return;
  const money = refundPreview(d.value.paidSen, percent.value ?? 0).split(' of ')[0];
  try {
    await ElMessageBox.confirm(`${FAULT_LABEL[fault.value]} · refund ${money}. This can't be undone.`, 'Submit decision?', { confirmButtonText: 'Submit', cancelButtonText: 'Back' });
  } catch {
    return;
  }
  busy.value = true;
  try {
    show(await decideException(orderId, index, { fault: fault.value, refundPercent: percent.value ?? 0, reason: reason.value }));
    ElMessage.success('Decision saved');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    show(await getException(orderId, index));
  } catch (e) {
    error.value = (e as Error).message;
  }
});
onUnmounted(() => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)));
</script>

<style scoped>
.sides { display: flex; gap: 16px; max-width: 1000px; margin-top: 16px; }
.side { flex: 1; min-width: 0; }
.kind { font-weight: 600; margin: 0 0 8px; }
.text { white-space: pre-wrap; margin: 0 0 8px; }
.label { font-weight: 600; margin: 12px 0 4px; }
.line { margin: 2px 0; }
.muted { color: var(--el-text-color-secondary); font-weight: 400; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; }
.photo { width: 96px; height: 96px; object-fit: cover; border-radius: 6px; border: 1px solid var(--el-border-color); }
.faults { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.refund { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.hint { color: var(--el-text-color-secondary); font-size: 13px; }
.error { color: var(--el-color-danger); }
</style>
