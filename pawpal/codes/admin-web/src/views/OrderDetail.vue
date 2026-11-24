<template>
  <div>
    <el-button link data-test="back" @click="router.push('/orders')">← Orders</el-button>
    <template v-if="d">
      <h2 data-test="order-title">Order {{ d.number }}</h2>
      <el-descriptions :column="2" border style="max-width: 1000px" data-test="order-head">
        <el-descriptions-item label="Owner">{{ d.owner }} · {{ d.area }}</el-descriptions-item>
        <el-descriptions-item label="Caregiver">{{ d.caregiver }}</el-descriptions-item>
        <el-descriptions-item label="Booking">
          <el-tag :type="BOOKING_TAG[d.booking]" data-test="order-booking">{{ BOOKING_STATE_LABEL[d.booking] }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Money">
          <el-tag :type="MONEY_STATUS_TAG[d.money]" data-test="order-money">{{ MONEY_STATUS_LABEL[d.money] }}</el-tag>
          <router-link v-if="d.payout" :to="`/money/${d.payout}`" class="link" data-test="order-payout">Payout</router-link>
        </el-descriptions-item>
        <el-descriptions-item label="Paid"><span data-test="order-paid">{{ formatRM(d.paidSen) }}</span></el-descriptions-item>
        <el-descriptions-item label="Refunds">
          <span data-test="order-refunds">Refunded {{ formatRM(d.refundedSen) }} · Processing {{ formatRM(d.refundProcessingSen) }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="d.substituteOf" label="Substitute for">{{ d.substituteOf }}</el-descriptions-item>
        <el-descriptions-item label="Made">{{ d.createdAt.slice(0, 16) }}</el-descriptions-item>
      </el-descriptions>

      <div class="address">
        <el-button v-if="!address" size="small" data-test="show-address" @click="reveal">Show address</el-button>
        <div v-else data-test="order-address">
          <strong>{{ address.street }}, {{ address.unit }}, {{ address.postcode }}</strong> · {{ address.contactName }} {{ address.contactPhone }}<br>
          <span class="muted">Entry: {{ address.entryMethod }}{{ address.entryNotes ? ` · ${address.entryNotes}` : '' }}</span>
        </div>
        <p class="muted">Each view of the address is recorded with your name.</p>
      </div>

      <h3>Visits</h3>
      <el-table :data="d.visitList" style="max-width: 1100px" data-test="order-visits">
        <el-table-column label="#" width="50">
          <template #default="{ row }">{{ row.index + 1 }}</template>
        </el-table-column>
        <el-table-column label="When" width="200">
          <template #default="{ row }">{{ visitWhen(row) }}</template>
        </el-table-column>
        <el-table-column label="Caregiver" min-width="160" prop="caregiver" />
        <el-table-column label="Status" width="160">
          <template #default="{ row }"><span data-test="visit-status">{{ row.status }}</span></template>
        </el-table-column>
        <el-table-column label="Money" min-width="170">
          <template #default="{ row }">
            {{ formatRM(row.priceSen) }}<div v-if="row.refund" class="muted">{{ row.refund }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Report" width="80">
          <template #default="{ row }">{{ row.reportSent ? 'Sent' : '—' }}</template>
        </el-table-column>
        <el-table-column label="Open" min-width="190">
          <template #default="{ row }">
            <router-link v-if="row.exception" :to="`/exceptions/${d!.id}/${row.index}`" class="link" :data-test="`visit-exception-${row.index}`">Exception</router-link>
            <router-link v-if="row.dispute" to="/cases" class="link" :data-test="`visit-case-${row.index}`">Case</router-link>
            <router-link v-for="m in row.money" :key="m" :to="`/money/${m}`" class="link" :data-test="`visit-money-${row.index}`">Refund</router-link>
          </template>
        </el-table-column>
      </el-table>

      <h3>Record</h3>
      <el-timeline style="max-width: 1000px" data-test="order-log">
        <el-timeline-item v-for="(l, k) in d.log" :key="k" :timestamp="l.at.slice(0, 19)">
          <span data-test="order-log-line">{{ l.who }}: {{ l.what }}</span>
        </el-timeline-item>
      </el-timeline>
      <p class="muted">Changes are made in Exceptions, Cases and Money, which always ask for a reason.</p>
    </template>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { BOOKING_STATE_LABEL, MONEY_STATUS_LABEL, formatRM, visitWhen, type AdminOrderAddress, type AdminOrderDetail } from '@pawpal/shared';
import { BOOKING_TAG, MONEY_STATUS_TAG, getOrder, showAddress } from '../api/orders';

/** E14-2 A08 (R58-3, R58-4): read only. */
const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
const d = ref<AdminOrderDetail | null>(null);
const address = ref<AdminOrderAddress | null>(null);
const error = ref('');

async function reveal() {
  try {
    address.value = await showAddress(id);
    d.value = await getOrder(id);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

onMounted(async () => {
  try {
    d.value = await getOrder(id);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.address { margin: 16px 0; }
.link { margin-right: 12px; }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.error { color: var(--el-color-danger); }
</style>
