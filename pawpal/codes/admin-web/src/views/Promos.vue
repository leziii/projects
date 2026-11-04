<template>
  <div>
    <h2>Promo codes</h2>
    <p class="hint">PawPal pays the discount; caregivers still get 85% of the full price. One code per order. Codes are turned off, never deleted.</p>

    <el-card shadow="never" style="max-width: 720px" data-test="promo-form">
      <h3>New code</h3>
      <el-form label-width="150px">
        <el-form-item label="Code"><el-input v-model="form.code" maxlength="16" placeholder="4–16 letters or numbers, e.g. WELCOME10" data-test="promo-code" /></el-form-item>
        <el-form-item label="Discount">
          <el-radio-group v-model="form.kind" data-test="promo-kind">
            <el-radio value="amount" data-test="kind-amount">RM off</el-radio>
            <el-radio value="percent" data-test="kind-percent">% off</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.kind === 'amount'" label="RM off"><el-input v-model="form.amountRM" placeholder="e.g. 10" data-test="promo-amount" /></el-form-item>
        <template v-else>
          <el-form-item label="% off"><el-input v-model="form.percent" placeholder="1–99" data-test="promo-percent" /></el-form-item>
          <el-form-item label="Up to RM"><el-input v-model="form.maxRM" placeholder="Leave empty for no maximum" data-test="promo-max" /></el-form-item>
        </template>
        <el-form-item label="Minimum spend RM"><el-input v-model="form.minSpendRM" placeholder="Leave empty for none" data-test="promo-min" /></el-form-item>
        <el-form-item label="From"><el-input v-model="form.startsOn" type="date" data-test="promo-start" /></el-form-item>
        <el-form-item label="Until (last day)"><el-input v-model="form.endsOn" type="date" data-test="promo-end" /></el-form-item>
        <el-form-item label="Total uses"><el-input v-model="form.totalUses" placeholder="Leave empty for no limit" data-test="promo-uses" /></el-form-item>
        <el-form-item label="Limits">
          <el-checkbox v-model="form.oncePerOwner" data-test="promo-once">Once per owner</el-checkbox>
          <el-checkbox v-model="form.firstOrderOnly" data-test="promo-first">First order only</el-checkbox>
        </el-form-item>
        <el-form-item label="Reason"><el-input v-model="form.reason" placeholder="Why this code (kept in history)" data-test="promo-reason" /></el-form-item>
      </el-form>
      <p class="hint" data-test="promo-hint">{{ block || 'Ready to create.' }}</p>
      <el-button type="primary" :disabled="!!block" data-test="promo-create" @click="create">Create</el-button>
    </el-card>

    <h3>Codes</h3>
    <el-input v-model="reason" placeholder="Reason for turning a code off or on (kept in history)" style="max-width: 720px" data-test="active-reason" />
    <p class="hint" data-test="active-hint">{{ reason.trim().length < PROMO_RULES.reasonMin ? `Type a reason here first (at least ${PROMO_RULES.reasonMin} characters), then press Turn off or Turn on.` : 'Now press Turn off or Turn on.' }}</p>
    <el-table :data="promos" data-test="promo-list">
      <el-table-column prop="code" label="Code" width="140" />
      <el-table-column label="Offer"><template #default="{ row }">{{ promoText(row) }}</template></el-table-column>
      <el-table-column label="Limits"><template #default="{ row }">{{ limitsText(row) }}</template></el-table-column>
      <el-table-column label="Uses" width="150"><template #default="{ row }">{{ usesText(row) }}</template></el-table-column>
      <el-table-column label="Status" width="90"><template #default="{ row }">{{ row.active ? 'On' : 'Off' }}</template></el-table-column>
      <el-table-column label="" width="200">
        <template #default="{ row }">
          <el-button size="small" :disabled="reason.trim().length < PROMO_RULES.reasonMin" :data-test="`toggle-${row.code}`" @click="toggle(row)">{{ row.active ? 'Turn off' : 'Turn on' }}</el-button>
          <el-button size="small" link :data-test="`history-${row.code}`" @click="showHistory(row)">History</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template v-if="history">
      <h3>History of {{ history.code }}</h3>
      <el-table :data="[...history.rows].reverse()" style="max-width: 720px" data-test="promo-history">
        <el-table-column prop="createdAt" label="When" width="200" />
        <el-table-column label="Change" width="120"><template #default="{ row }">{{ row.fromStatus ?? 'new' }} → {{ row.toStatus }}</template></el-table-column>
        <el-table-column label="Who · why"><template #default="{ row }">{{ whoWhy(row) }}</template></el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { PROMO_RULES, klDate, promoText, type Promo, type StatusChange } from '@pawpal/shared';
import { whoWhy } from '../api/history';
import { createPromo, emptyPromoForm, fetchPromoHistory, fetchPromos, limitsText, promoFormBlock, setPromoActive, usesText } from '../api/promos';

const form = reactive(emptyPromoForm(klDate(new Date())));
const promos = ref<Promo[]>([]);
const reason = ref('');
const history = ref<{ code: string; rows: StatusChange[] } | null>(null);
const block = computed(() => promoFormBlock(form));

onMounted(load);

async function load() {
  promos.value = await fetchPromos();
}

async function create() {
  try {
    const p = await createPromo({ ...form });
    ElMessage.success(`${p.code} created`);
    Object.assign(form, emptyPromoForm(klDate(new Date())));
    await load();
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function toggle(p: Promo) {
  try {
    await setPromoActive(p.id, !p.active, reason.value);
    reason.value = '';
    await load();
    if (history.value?.code === p.code) await showHistory(p);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function showHistory(p: Promo) {
  history.value = { code: p.code, rows: await fetchPromoHistory(p.id) };
}
</script>

<style scoped>
.hint { color: var(--pp-muted); font-size: 13px; }
</style>
