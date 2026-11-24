<template>
  <div>
    <h2>Orders</h2>
    <el-form inline data-test="order-filters" @submit.prevent="search">
      <el-form-item label="Booking">
        <el-select v-model="f.booking" clearable placeholder="Any" style="width: 140px" data-test="filter-booking" @change="search">
          <el-option v-for="b in BOOKING_STATES" :key="b" :label="BOOKING_STATE_LABEL[b]" :value="b" />
        </el-select>
      </el-form-item>
      <el-form-item label="Money">
        <el-select v-model="f.money" clearable placeholder="Any" style="width: 170px" data-test="filter-money" @change="search">
          <el-option v-for="m in MONEY_STATUSES" :key="m" :label="MONEY_STATUS_LABEL[m]" :value="m" />
        </el-select>
      </el-form-item>
      <el-form-item label="Made">
        <el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="From" end-placeholder="To" style="width: 240px" data-test="filter-dates" @change="search" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="f.q" clearable placeholder="Order number or phone" style="width: 210px" data-test="filter-q" @clear="search" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" data-test="order-search">Search</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="page.rows" data-test="orders" style="max-width: 1200px" empty-text="No orders" @row-click="open">
      <el-table-column label="Order" width="150" prop="number" />
      <el-table-column label="Made" width="150">
        <template #default="{ row }">{{ row.createdAt.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="Owner" width="150" prop="owner" />
      <el-table-column label="Caregiver" min-width="150" prop="caregiver" />
      <el-table-column label="Visits" width="130">
        <template #default="{ row }">{{ visitSummary(row.visits, row.cancelled) }}</template>
      </el-table-column>
      <el-table-column label="Booking" width="120">
        <template #default="{ row }">
          <el-tag :type="BOOKING_TAG[row.booking as BookingState]" :data-test="`booking-${row.id}`">{{ BOOKING_STATE_LABEL[row.booking as BookingState] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Money" width="160">
        <template #default="{ row }">
          <el-tag :type="MONEY_STATUS_TAG[row.money as MoneyStatus]" :data-test="`money-${row.id}`">{{ MONEY_STATUS_LABEL[row.money as MoneyStatus] }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="page.total > ADMIN_ORDER_RULES.pageSize"
      :current-page="f.page"
      layout="prev, pager, next, total"
      :page-size="ADMIN_ORDER_RULES.pageSize"
      :total="page.total"
      style="margin-top: 12px"
      data-test="order-pages"
      @current-change="go"
    />
    <p v-else class="muted" data-test="order-total">{{ page.total }} order{{ page.total === 1 ? '' : 's' }}</p>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ADMIN_ORDER_RULES, BOOKING_STATES, BOOKING_STATE_LABEL, MONEY_STATUSES, MONEY_STATUS_LABEL, visitSummary, type AdminOrderPage, type AdminOrderRow, type BookingState, type MoneyStatus } from '@pawpal/shared';
import { BOOKING_TAG, MONEY_STATUS_TAG, listOrders, type OrderFilters } from '../api/orders';

/** E14-2 A07 (R58-1, R58-2): booking and money filters are separate and can be combined. */
const router = useRouter();
const f = reactive<OrderFilters>({ booking: '', money: '', from: '', to: '', q: '', page: 1 });
const dates = ref<[string, string] | null>(null);
const page = ref<AdminOrderPage>({ rows: [], total: 0, page: 1 });
const error = ref('');

async function load() {
  f.from = dates.value?.[0] ?? '';
  f.to = dates.value?.[1] ?? '';
  f.booking = f.booking ?? '';
  f.money = f.money ?? '';
  try {
    page.value = await listOrders(f);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function search() {
  f.page = 1;
  void load();
}

function go(p: number) {
  f.page = p;
  void load();
}

const open = (r: AdminOrderRow) => void router.push(`/orders/${r.id}`);

onMounted(load);
</script>

<style scoped>
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.error { color: var(--el-color-danger); }
:deep(.el-table__row) { cursor: pointer; }
</style>
