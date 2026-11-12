<template>
  <div>
    <h2>Payments (test)</h2>
    <el-alert
      type="info"
      :closable="false"
      title="Mock gateway: no real money. Create a payment, then choose what the bank does."
      style="max-width: 900px; margin-bottom: 16px"
    />
    <div v-if="stuck.length" class="stuck" data-test="stuck-refunds">
      <el-alert type="error" :closable="false" :title="`${stuck.length} refund${stuck.length === 1 ? '' : 's'} failed every automatic try. Check the reason, then send again.`" style="margin-bottom: 8px" />
      <el-table :data="stuck" style="max-width: 1100px; margin-bottom: 20px">
        <el-table-column prop="number" label="Order" width="160" />
        <el-table-column prop="reason" label="Refund for" min-width="150" />
        <el-table-column label="Amount" width="100">
          <template #default="{ row }">{{ formatRM(row.amountSen) }}</template>
        </el-table-column>
        <el-table-column prop="tries" label="Tries" width="70" />
        <el-table-column label="Last failure" min-width="200">
          <template #default="{ row }">
            <div class="reason">{{ row.lastFailure ?? 'No reason given' }}</div>
            <div class="who">{{ row.failedAt }}</div>
          </template>
        </el-table-column>
        <el-table-column label="" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" :data-test="`retry-${row.orderId}-${row.key}`" @click="retry(row)">Send again</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-form inline data-test="new-payment" @submit.prevent>
      <el-form-item label="Amount (RM)">
        <el-input v-model="amount" style="width: 110px" data-test="amount" />
      </el-form-item>
      <el-form-item label="Method">
        <el-select v-model="method" style="width: 190px" data-test="method">
          <el-option v-for="(label, key) in PAYMENT_METHODS" :key="key" :label="label" :value="key" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" data-test="new-charge" @click="run(() => createCharge(sen(amount), method), 'Charge created')">
          Create charge
        </el-button>
        <el-button data-test="new-payout" @click="run(() => createPayout(sen(amount), 'caregiver-test'), 'Payout created')">
          Create payout
        </el-button>
      </el-form-item>
    </el-form>

    <el-table :data="payments" data-test="payments" style="max-width: 1100px" empty-text="No payments yet">
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column prop="kind" label="Kind" width="90" />
      <el-table-column label="Amount" width="100">
        <template #default="{ row }">{{ amountLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="Detail" min-width="150">
        <template #default="{ row }">{{ paymentDetail(row) }}</template>
      </el-table-column>
      <el-table-column label="Status" width="200">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" :data-test="`status-${row.id}`">{{ statusLabel(row.status) }}</el-tag>
          <div v-if="row.failureReason" class="reason">{{ row.failureReason }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="webhooks" label="Webhooks" width="100" />
      <el-table-column label="Simulate" min-width="380">
        <template #default="{ row }">
          <div :data-test="`actions-${row.id}`">
            <el-button size="small" link type="primary" @click="openHistory(row)">History</el-button>
            <template v-if="!isFinalPayment(row.status)">
              <el-button size="small" type="success" @click="sim(row.id, 'success')">Success</el-button>
              <el-button size="small" type="danger" @click="sim(row.id, 'failure')">Fail</el-button>
              <el-button v-if="row.status === 'pending'" size="small" @click="sim(row.id, 'unknown')">Unknown</el-button>
              <el-button v-else size="small" type="warning" @click="run(() => queryPayment(row.id), 'Asked the gateway')">
                Query gateway
              </el-button>
            </template>
            <template v-else>
              <el-button v-if="row.webhooks > 0" size="small" @click="runSim(() => resendWebhook(row.id))">Resend webhook</el-button>
              <el-button v-if="row.kind === 'charge' && row.status === 'succeeded'" size="small" @click="refund(row)">Refund</el-button>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="historyOpen" :title="`History of payment #${historyId}`" size="420px">
      <el-timeline data-test="history">
        <el-timeline-item v-for="c in history" :key="c.id" :timestamp="c.createdAt" placement="top">
          <strong>{{ stepLabel(c) }}</strong>
          <div class="who">{{ whoWhy(c) }}</div>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatRM, isFinalPayment, PAYMENT_METHODS, rmToSen, type MockOutcome, type Payment, type PaymentMethod, type StatusChange, type StuckRefund } from '@pawpal/shared';
import { fetchHistory, stepLabel, whoWhy } from '../api/history';
import {
  amountLabel,
  createCharge,
  createPayout,
  createRefund,
  listPayments,
  listStuckRefunds,
  retryRefund,
  paymentDetail,
  queryPayment,
  resendWebhook,
  simulate,
  statusLabel,
  statusTag,
  webhookMessage,
  type SimResult,
} from '../api/payments';

const payments = ref<Payment[]>([]);
const stuck = ref<StuckRefund[]>([]);
const amount = ref('40');
const method = ref<PaymentMethod>('tng');

/** Bad amount → 0, which the server rejects with a clear message. */
const sen = (rm: string) => rmToSen(rm) ?? 0;

const historyOpen = ref(false);
const historyId = ref(0);
const history = ref<StatusChange[]>([]);

async function reload() {
  [payments.value, stuck.value] = await Promise.all([listPayments(), listStuckRefunds()]);
  if (historyOpen.value) history.value = await fetchHistory('payment', historyId.value);
}

async function openHistory(p: Payment) {
  historyId.value = p.id;
  try {
    history.value = await fetchHistory('payment', p.id);
    historyOpen.value = true;
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function run(action: () => Promise<unknown>, done: string) {
  try {
    await action();
    ElMessage.success(done);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
  await reload();
}

async function runSim(action: () => Promise<SimResult>) {
  try {
    const result = await action();
    ElMessage({ type: result.webhook === 'applied' ? 'success' : 'info', message: webhookMessage(result) });
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
  await reload();
}

const sim = (id: number, outcome: MockOutcome) => runSim(() => simulate(id, outcome));

const retry = (r: StuckRefund) => run(() => retryRefund(r.orderId, r.key), `Refund for ${r.number} sent again`);

async function refund(p: Payment) {
  try {
    const { value } = await ElMessageBox.prompt(`Refund amount (RM) for payment #${p.id}`, 'Refund', {
      inputValue: (p.amountSen / 100).toString(),
      confirmButtonText: 'Refund',
    });
    await run(() => createRefund(p.id, sen(value)), 'Refund created');
  } catch {
    // Cancelled.
  }
}

onMounted(() => reload().catch(() => ElMessage.error('Server not reachable')));
</script>

<style scoped>
.reason { color: var(--pp-danger); font-size: 12px; margin-top: 4px; }
.who { color: var(--pp-muted); font-size: 13px; margin-top: 2px; }
</style>
