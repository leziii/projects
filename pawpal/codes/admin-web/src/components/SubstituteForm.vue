<template>
  <div data-test="substitute-form">
    <p class="label">Visits the substitute takes</p>
    <div v-for="v in movable" :key="v.index" class="visit" :data-test="`sub-visit-${v.index}`">
      <el-checkbox v-model="picked[v.index]" :data-test="`sub-pick-${v.index}`" @change="reset">Visit {{ v.index + 1 }} · {{ visitWhen(v) }}</el-checkbox>
      <el-select v-model="starts[v.index]" size="small" style="width: 130px" :disabled="!picked[v.index]" :data-test="`sub-start-${v.index}`" @change="reset">
        <el-option v-for="s in START_OPTIONS" :key="s" :label="timeText(s)" :value="s" />
      </el-select>
    </div>
    <p v-if="!movable.length" class="muted" data-test="sub-none">No visit can move: only visits not started yet can.</p>
    <el-button size="small" :disabled="!chosen.length || busy" data-test="find-caregivers" @click="find">Find caregivers</el-button>

    <template v-if="candidates">
      <p class="label">Free caregivers <span class="muted" data-test="candidate-count">· {{ candidates.length }} · ID verified first, then most experienced</span></p>
      <el-radio-group v-model="caregiverId" class="list" data-test="candidates">
        <el-radio v-for="c in candidates" :key="c.id" :value="c.id" :data-test="`candidate-${c.id}`">
          {{ c.displayName }} <span class="muted">· {{ c.experienceYears }} yr{{ c.idVerified ? ' · ID verified' : '' }} · {{ c.areas.join(', ') }}</span>
        </el-radio>
      </el-radio-group>
      <p v-if="!candidates.length" class="muted" data-test="no-candidates">Nobody is free for those times. Try other times, or decide with a refund.</p>
    </template>

    <el-input v-model="reason" type="textarea" :maxlength="SUBSTITUTE_RULES.reasonMax" show-word-limit placeholder="Reason for the owner" style="margin-top: 12px" data-test="sub-reason" />
    <p class="hint" data-test="sub-hint">{{ problem || `The owner has ${SUBSTITUTE_RULES.answerHours} hours to approve. Nothing changes until then.` }}</p>
    <el-button type="primary" :disabled="!!problem || busy" data-test="send-substitute" @click="send">Send to owner</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { SUBSTITUTE_RULES, canMove, checkSubstitute, startOptions, timeText, visitWhen, type ExceptionDetail, type SubstituteCandidate, type SubstituteOffer } from '@pawpal/shared';
import { findCandidates, offerSubstitute } from '../api/exceptions';

/** E12-4 A10 (R52-1, R52-2): pick visits and times, find a free caregiver, then offer them to the owner. */
const props = defineProps<{ detail: ExceptionDetail }>();
const emit = defineEmits<{ sent: [offer: SubstituteOffer] }>();
const START_OPTIONS = startOptions();

const movable = computed(() => props.detail.visits.filter((v) => canMove(v.status)));
const picked = reactive<Record<number, boolean>>(Object.fromEntries(movable.value.map((v) => [v.index, v.index === props.detail.index])));
const starts = reactive<Record<number, number>>(Object.fromEntries(movable.value.map((v) => [v.index, v.start])));
const candidates = ref<SubstituteCandidate[] | null>(null);
const caregiverId = ref<number | undefined>();
const reason = ref('');
const busy = ref(false);

const chosen = computed(() => movable.value.filter((v) => picked[v.index]).map((v) => ({ index: v.index, start: starts[v.index] })));
const problem = computed(() => {
  if (!candidates.value) return chosen.value.length ? 'Find caregivers for the visits you chose' : 'Choose at least one visit';
  try {
    checkSubstitute({ caregiverId: caregiverId.value, visits: chosen.value, reason: reason.value }, START_OPTIONS);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
});

/** A change of visits or times needs a new search. */
function reset() {
  candidates.value = null;
  caregiverId.value = undefined;
}

async function find() {
  busy.value = true;
  try {
    candidates.value = await findCandidates(props.detail.orderId, props.detail.index, chosen.value);
    caregiverId.value = undefined;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}

async function send() {
  if (problem.value || caregiverId.value === undefined) return;
  busy.value = true;
  try {
    emit('sent', await offerSubstitute(props.detail.orderId, props.detail.index, { caregiverId: caregiverId.value, visits: chosen.value, reason: reason.value.trim() }));
    ElMessage.success('Sent to the owner');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.label { font-weight: 600; margin: 12px 0 4px; }
.visit { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.list { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-height: 280px; overflow-y: auto; flex-wrap: nowrap; width: 100%; }
.muted { color: var(--el-text-color-secondary); font-weight: 400; }
.hint { color: var(--el-text-color-secondary); font-size: 13px; }
</style>
