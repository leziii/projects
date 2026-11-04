<template>
  <div>
    <h2>Rules</h2>
    <el-alert v-if="!rules" type="error" title="Server not reachable" :closable="false" />
    <template v-else>
      <p class="version">Version {{ rules.version }}</p>
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
import { INSURANCE_NOTE_MAX, priceList, type RuleSet, type SupportInfo } from '@pawpal/shared';
import { whoWhy } from '../api/history';
import { fetchInsurance, fetchRules, fetchSupport, insuranceBlock, ruleSummary, saveInsurance, supportSummary, type InsuranceAdmin, type InsuranceForm } from '../api/rules';

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
</style>
