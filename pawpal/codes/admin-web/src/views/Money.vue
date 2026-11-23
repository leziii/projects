<template>
  <div>
    <h2>Money</h2>
    <el-alert type="info" :closable="false" :title="MONEY_NOTE" style="max-width: 1100px; margin-bottom: 16px" data-test="money-note" />
    <el-radio-group v-model="tab" style="margin-bottom: 12px" data-test="money-tabs" @change="pageNo = 1">
      <el-radio-button v-for="t in MONEY_TABS" :key="t" :value="t" :data-test="`money-tab-${t}`">{{ MONEY_TAB_LABEL[t] }} ({{ moneyTab(items, t).length }})</el-radio-button>
    </el-radio-group>
    <el-table :data="pageRows" data-test="money" style="max-width: 1100px" empty-text="Nothing here" @row-click="open">
      <el-table-column label="Type" width="120">
        <template #default="{ row }">{{ MONEY_KIND_LABEL[row.kind as MoneyKind] }}</template>
      </el-table-column>
      <el-table-column label="Order" width="190">
        <template #default="{ row }">{{ moneyWhereText(row) }}</template>
      </el-table-column>
      <el-table-column label="For" min-width="180" prop="what" />
      <el-table-column label="Amount" width="100">
        <template #default="{ row }">{{ formatRM(row.amountSen) }}</template>
      </el-table-column>
      <el-table-column label="Status" min-width="220">
        <template #default="{ row }">
          <el-tag :type="MONEY_TAG[row.state as MoneyState]" :data-test="`money-state-${row.id}`">{{ moneyStateText(row) }}</el-tag>
          <span class="muted"> · {{ tryCountText(row.tries) }}</span>
          <div v-if="row.lastFailure" class="reason">{{ row.lastFailure }}</div>
        </template>
      </el-table-column>
      <el-table-column label="" width="100">
        <template #default="{ row }">
          <el-button size="small" :type="row.state === 'failed' ? 'primary' : 'default'" :data-test="`money-open-${row.id}`" @click.stop="open(row)">{{ row.state === 'failed' ? 'Handle' : 'View' }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="shown.length > PAGE_SIZE"
      v-model:current-page="pageNo"
      layout="prev, pager, next, total"
      :page-size="PAGE_SIZE"
      :total="shown.length"
      style="margin-top: 12px"
      data-test="money-pages"
    />
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MONEY_KIND_LABEL, MONEY_NOTE, MONEY_TABS, MONEY_TAB_LABEL, formatRM, moneyTab, tryCountText, type MoneyItem, type MoneyKind, type MoneyState, type MoneyTab } from '@pawpal/shared';
import { MONEY_TAG, listMoney, moneyStateText, moneyWhereText } from '../api/money';

/** E13-4 A13 (R56-1): refunds, fee refunds and order payouts; failed first. */
const router = useRouter();
const items = ref<MoneyItem[]>([]);
const route = useRoute();
// E14-1: the dashboard opens Money on the Failed or Processing tab.
const tab = ref<MoneyTab>(MONEY_TABS.includes(route.query.tab as MoneyTab) ? (route.query.tab as MoneyTab) : 'all');
const error = ref('');
const shown = computed(() => moneyTab(items.value, tab.value));
const PAGE_SIZE = 20;
const pageNo = ref(1);
const pageRows = computed(() => shown.value.slice((pageNo.value - 1) * PAGE_SIZE, pageNo.value * PAGE_SIZE));

const open = (i: MoneyItem) => void router.push(`/money/${i.id}`);

onMounted(async () => {
  try {
    items.value = await listMoney();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.error { color: var(--el-color-danger); }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.reason { color: var(--el-color-danger); font-size: 12px; margin-top: 4px; }
:deep(.el-table__row) { cursor: pointer; }
</style>
