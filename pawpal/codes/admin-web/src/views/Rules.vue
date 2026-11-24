<template>
  <div>
    <h2>Rules</h2>
    <el-alert v-if="!rules" type="error" title="Server not reachable" :closable="false" />
    <template v-else>
      <p class="version" data-test="rules-version">Version {{ rules.version }}<template v-if="versions"> · {{ versionWhen(versions.current) }}</template></p>
      <p class="hint">{{ RULES_NOTE }}</p>
      <h3>Prices</h3>
      <el-table :data="priceList(rules)" data-test="prices" style="max-width: 720px">
        <el-table-column prop="service" label="Service" />
        <el-table-column prop="price" label="Price" />
        <el-table-column label="Min time">
          <template #default="{ row }">{{ row.minMinutes ? `${row.minMinutes} min` : '—' }}</template>
        </el-table-column>
      </el-table>
      <h3>Limits</h3>
      <el-table :data="ruleSummary(rules)" data-test="limits" style="max-width: 720px">
        <el-table-column prop="item" label="Item" width="160" />
        <el-table-column prop="rule" label="Rule" />
      </el-table>
      <template v-if="versions">
        <h3>Rule versions</h3>
        <el-card v-if="versions.waiting" shadow="never" class="box" data-test="waiting-version">
          <p class="strong">{{ versions.waiting.version }} · {{ versionWhen(versions.waiting) }} · by {{ versions.waiting.admin }}</p>
          <p class="hint">Why: {{ versions.waiting.reason }}</p>
          <ul data-test="waiting-changes">
            <li v-for="c in versions.waiting.changes" :key="c.key">{{ ruleChangeText(c) }}</li>
          </ul>
          <div class="row">
            <el-input v-model="withdrawReason" placeholder="Reason to withdraw (kept in history)" style="max-width: 360px" data-test="withdraw-reason" />
            <el-button type="danger" plain :disabled="withdrawReason.trim().length < 5" data-test="withdraw" @click="withdraw">Withdraw</el-button>
          </div>
        </el-card>
        <el-button v-if="!editing" type="primary" data-test="new-version" @click="startEdit">{{ versions.waiting ? 'Replace waiting version' : 'New version' }}</el-button>
        <el-card v-else shadow="never" class="box" data-test="edit-version">
          <p class="hint">Change the values, pick the start date and give a reason. Capacity, accept windows and booking hours cannot be changed here.</p>
          <div v-for="g in groups" :key="g.group" class="group" :data-test="`group-${g.group}`">
            <p class="strong">{{ RULE_GROUP_LABEL[g.group] }}</p>
            <div class="fields">
              <label v-for="x in g.fields" :key="x.key" class="field">
                <span>{{ x.label }} ({{ UNIT[x.unit] }})</span>
                <el-input-number
                  v-model="edit.values[x.key]"
                  :min="x.unit === 'sen' ? x.min / 100 : x.min"
                  :max="x.unit === 'sen' ? x.max / 100 : x.max"
                  :precision="x.unit === 'sen' ? 2 : 0"
                  :step="1"
                  controls-position="right"
                  :data-test="`field-${x.key}`"
                />
              </label>
            </div>
          </div>
          <div class="row">
            <el-date-picker v-model="edit.effectiveFrom" type="date" value-format="YYYY-MM-DD" :disabled-date="notAllowed" placeholder="Start date" data-test="effective-from" />
            <el-input v-model="edit.reason" placeholder="Reason for the change (kept in history)" style="max-width: 420px" data-test="version-reason" />
          </div>
          <p class="strong">Preview</p>
          <ul v-if="check.changes.length" data-test="preview">
            <li v-for="c in check.changes" :key="c.key">{{ ruleChangeText(c) }}</li>
          </ul>
          <p v-else class="hint" data-test="preview">No changes yet.</p>
          <p v-if="versions.waiting" class="hint" data-test="replace-note">Saving replaces the version waiting for {{ versions.waiting.effectiveFrom }}.</p>
          <p class="hint" data-test="version-hint">{{ check.block || `Ready: new orders paid from ${edit.effectiveFrom} use these rules.` }}</p>
          <div class="row">
            <el-button type="primary" :disabled="!!check.block || busy" data-test="save-version" @click="saveVersion">Save new version</el-button>
            <el-button data-test="cancel-edit" @click="editing = false">Cancel</el-button>
          </div>
        </el-card>
        <el-table :data="versions.history" style="margin-top: 16px" data-test="version-history">
          <el-table-column label="Start" width="120" prop="effectiveFrom" />
          <el-table-column label="Version" width="150" prop="version" />
          <el-table-column label="State" width="120">
            <template #default="{ row }">
              <el-tag :type="VERSION_TAG[row.state as RuleVersion['state']]" size="small">{{ RULE_VERSION_STATE_LABEL[row.state as RuleVersion['state']] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Who · why" min-width="220">
            <template #default="{ row }">
              {{ row.admin }} · {{ row.reason }}<span v-if="row.withdrawReason" class="hint"> · withdrawn: {{ row.withdrawReason }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Changes" min-width="320">
            <template #default="{ row }">
              <div v-for="c in row.changes" :key="c.key">{{ ruleChangeText(c) }}</div>
              <span v-if="!row.changes.length" class="hint">—</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <h3>Support</h3>
      <p data-test="support-whatsapp">WhatsApp: {{ supportSummary(support) }}</p>
      <h3>Insurance note</h3>
      <el-card v-if="insurance" shadow="never" style="max-width: 720px" data-test="insurance">
        <p class="hint">Owners see this note on every caregiver card (O08) only while it is on. Keep it off until the policy is real.</p>
        <el-switch v-model="form.on" active-text="Insurance in place" inactive-text="Off" data-test="insurance-on" />
        <el-input
          v-model="form.note"
          type="textarea"
          :maxlength="INSURANCE_NOTE_MAX"
          show-word-limit
          placeholder="What it covers, e.g. Pet injury cover up to RM5,000 per visit"
          style="margin-top: 12px"
          data-test="insurance-note"
        />
        <el-input v-model="form.reason" placeholder="Reason for the change (kept in history)" style="margin-top: 12px" data-test="insurance-reason" />
        <p class="hint" data-test="insurance-hint">{{ block || 'Ready to save.' }}</p>
        <el-button type="primary" :disabled="!!block" data-test="insurance-save" @click="save">Save</el-button>
        <el-table :data="[...insurance.history].reverse()" style="margin-top: 16px" data-test="insurance-history">
          <el-table-column prop="createdAt" label="When" width="200" />
          <el-table-column label="Change" width="120">
            <template #default="{ row }">{{ row.fromStatus }} → {{ row.toStatus }}</template>
          </el-table-column>
          <el-table-column label="Who · why">
            <template #default="{ row }">{{ whoWhy(row) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  INSURANCE_NOTE_MAX,
  RULE_FIELDS,
  RULE_GROUP_LABEL,
  RULE_VERSION_STATE_LABEL,
  RULES_NOTE,
  klDate,
  priceList,
  ruleChangeText,
  tomorrowOf,
  type RuleGroup,
  type RuleSet,
  type RuleUnit,
  type RuleVersion,
  type RulesAdmin,
  type SupportInfo,
} from '@pawpal/shared';
import { whoWhy } from '../api/history';
import {
  VERSION_TAG,
  fetchInsurance,
  fetchRuleVersions,
  fetchRules,
  fetchSupport,
  insuranceBlock,
  ruleEditCheck,
  ruleSummary,
  saveInsurance,
  saveRuleVersion,
  supportSummary,
  toForm,
  versionWhen,
  withdrawRuleVersion,
  fromForm,
  type InsuranceAdmin,
  type InsuranceForm,
  type RuleEditForm,
} from '../api/rules';

const UNIT: Record<RuleUnit, string> = { sen: 'RM', min: 'min', h: 'hours', '%': '%' };
const groups = (['price', 'minMinutes', 'waiting', 'cancel', 'split'] as RuleGroup[]).map((group) => ({ group, fields: RULE_FIELDS.filter((x) => x.group === group) }));
const versions = ref<RulesAdmin | null>(null);
const editing = ref(false);
const busy = ref(false);
const withdrawReason = ref('');
const today = () => klDate(new Date());
const edit = reactive<RuleEditForm>({ values: {}, effectiveFrom: '', reason: '' });
const check = computed(() => (versions.value ? ruleEditCheck(edit, versions.value.current.rules, today()) : { changes: [], block: '' }));
/** R59-3: tomorrow (KL) at the earliest. */
const notAllowed = (d: Date) => {
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return day < tomorrowOf(today());
};

function startEdit() {
  const base = versions.value!.waiting ?? versions.value!.current;
  Object.assign(edit, { values: toForm(base.rules), effectiveFrom: versions.value!.waiting?.effectiveFrom ?? tomorrowOf(today()), reason: '' });
  editing.value = true;
}

async function saveVersion() {
  busy.value = true;
  try {
    versions.value = await saveRuleVersion({ values: fromForm(edit.values), effectiveFrom: edit.effectiveFrom, reason: edit.reason.trim() });
    editing.value = false;
    ElMessage.success(versions.value.waiting ? `Saved. ${versionWhen(versions.value.waiting)}.` : 'Saved.');
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    busy.value = false;
  }
}

async function withdraw() {
  try {
    versions.value = await withdrawRuleVersion(versions.value!.waiting!.version, withdrawReason.value.trim());
    withdrawReason.value = '';
    editing.value = false;
    ElMessage.success('Withdrawn');
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const rules = ref<RuleSet | null>(null);
const support = ref<SupportInfo | null>(null);
const insurance = ref<InsuranceAdmin | null>(null);
const form = reactive<InsuranceForm>({ on: false, note: '', reason: '' });
const block = computed(() => (insurance.value ? insuranceBlock(form, insurance.value.insurance) : ''));

function show(data: InsuranceAdmin) {
  insurance.value = data;
  Object.assign(form, data.insurance, { reason: '' });
}

onMounted(async () => {
  [rules.value, support.value] = await Promise.all([fetchRules(), fetchSupport()]);
  versions.value = await fetchRuleVersions().catch(() => null);
  show(await fetchInsurance());
});

async function save() {
  try {
    show(await saveInsurance({ ...form }));
    ElMessage.success(form.on ? 'Insurance note is on' : 'Insurance note is off');
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<style scoped>
.version { color: var(--pp-muted); }
.hint { color: var(--pp-muted); font-size: 13px; }
.strong { font-weight: 600; margin: 8px 0 4px; }
.box { max-width: 960px; margin-bottom: 12px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.group { margin-bottom: 8px; }
.fields { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.field { display: flex; flex-direction: column; font-size: 13px; color: var(--pp-muted); gap: 2px; }
</style>
