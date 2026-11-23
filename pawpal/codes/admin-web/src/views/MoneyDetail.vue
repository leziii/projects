<template>
  <div>
    <el-button link data-test="back" @click="router.push('/money')">← Money</el-button>
    <template v-if="d">
      <h2 data-test="money-title">{{ MONEY_KIND_LABEL[d.kind] }} · {{ moneyWhereText(d) }}</h2>
      <el-descriptions :column="1" border style="max-width: 760px" data-test="money-detail">
        <el-descriptions-item label="For"><span data-test="money-what">{{ d.what }}</span></el-descriptions-item>
        <el-descriptions-item label="Amount"><span data-test="money-amount">{{ formatRM(d.amountSen) }}</span></el-descriptions-item>
        <el-descriptions-item label="How"><span data-test="money-how">{{ d.how }}</span></el-descriptions-item>
        <el-descriptions-item label="Reference">{{ d.id }}</el-descriptions-item>
        <el-descriptions-item label="Status">
          <el-tag :type="MONEY_TAG[d.state]" data-test="money-status">{{ moneyStateText(d) }}</el-tag>
          <span class="muted"> · {{ tryCountText(d.tries) }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h3>Tries</h3>
      <el-table :data="d.tryList" style="max-width: 760px" data-test="money-tries">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column label="Reference" min-width="200" prop="ref" />
        <el-table-column label="Bank answer" min-width="220">
          <template #default="{ row }"><span :class="{ reason: row.status === 'failed' }" data-test="money-try">{{ tryStatusText(row) }}</span></template>
        </el-table-column>
        <el-table-column label="When" width="170">
          <template #default="{ row }">{{ row.at.slice(0, 16) }}</template>
        </el-table-column>
      </el-table>

      <div class="actions">
        <el-button v-if="canSendAgain(d)" type="primary" :disabled="busy" data-test="send-again" @click="again">Send again</el-button>
        <el-button v-if="canCheckBank(d)" :disabled="busy" data-test="check-bank" @click="check">Check with bank</el-button>
        <p class="muted" data-test="money-hint">{{ hint }}</p>
      </div>

      <h3>Record</h3>
      <el-timeline style="max-width: 760px" data-test="money-log">
        <el-timeline-item v-for="(l, k) in d.log" :key="k" :timestamp="l.at.slice(0, 19)">
          <span data-test="money-log-line">{{ l.who }}: {{ l.what }}</span>
        </el-timeline-item>
      </el-timeline>
    </template>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { MONEY_KIND_LABEL, MONEY_RULES, canCheckBank, canSendAgain, formatRM, tryCountText, tryStatusText, type MoneyDetail } from '@pawpal/shared';
import { MONEY_TAG, checkBank, getMoney, moneyStateText, moneyWhereText, sendAgain } from '../api/money';

/** E13-4 A14 (R56-2 … R56-4): one refund or payout, every try, and the two safe actions. Nothing here marks it paid. */
const route = useRoute();
const router = useRouter();
const id = String(route.params.id);
const d = ref<MoneyDetail | null>(null);
const error = ref('');
const busy = ref(false);

const hint = computed(() => {
  if (!d.value) return '';
  if (d.value.state === 'done') return 'The bank confirmed it. Nothing more to do.';
  if (d.value.state === 'failed') return 'Check the bank reason first. Sending again makes one new try; the bank can never pay it twice.';
  return d.value.late ? 'No answer from the bank for a long time. Ask the bank for the result.' : `Waiting for the bank. If there is no answer after ${MONEY_RULES.checkAfterMinutes} minutes you can check with the bank.`;
});

async function run(action: () => Promise<MoneyDetail>, done: string) {
  busy.value = true;
  try {
    d.value = await action();
    ElMessage.success(done);
  } catch (e) {
    ElMessage.error((e as Error).message);
    d.value = await getMoney(id).catch(() => d.value);
  } finally {
    busy.value = false;
  }
}

async function again() {
  try {
    await ElMessageBox.confirm(`Send ${formatRM(d.value!.amountSen)} again? This makes one new try.`, 'Send again', { confirmButtonText: 'Send again', cancelButtonText: 'Cancel' });
  } catch {
    return;
  }
  await run(() => sendAgain(id), 'Sent again');
}

const check = () => run(() => checkBank(id), 'Checked with the bank');

onMounted(async () => {
  try {
    d.value = await getMoney(id);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.actions { margin: 16px 0; }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.reason { color: var(--el-color-danger); }
.error { color: var(--el-color-danger); }
</style>
