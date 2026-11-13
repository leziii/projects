<template>
  <div>
    <h2>Test tools</h2>
    <el-alert
      type="warning"
      :closable="false"
      title="Development only. These stand in for admin screens that come in later stories, and are switched off in production."
      style="max-width: 900px; margin-bottom: 16px"
    />
    <el-card style="max-width: 640px" shadow="never">
      <template #header>Caregiver status (until caregiver review, E4-2)</template>
      <el-form label-width="110px" data-test="caregiver-tool" @submit.prevent>
        <el-form-item label="Phone">
          <el-input v-model="phone" placeholder="012-345 6789 (must have logged in once)" data-test="cg-phone" />
        </el-form-item>
        <el-form-item label="Status">
          <el-select v-model="status" data-test="cg-status" style="width: 100%">
            <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Reason">
          <el-input v-model="reason" placeholder="e.g. IC checked, interview passed" data-test="cg-reason" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="cg-save" @click="save">Save</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Send a test message (until real events send them)</template>
      <el-form label-width="110px" data-test="message-tool" @submit.prevent>
        <el-form-item label="Phone">
          <el-input v-model="msg.phone" placeholder="012-345 6789 (must have logged in once)" data-test="msg-phone" />
        </el-form-item>
        <el-form-item label="For role">
          <el-select v-model="msg.role" placeholder="Either role" data-test="msg-role" style="width: 100%">
            <el-option v-for="o in MESSAGE_ROLE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Category">
          <el-select v-model="msg.category" data-test="msg-category" style="width: 100%">
            <el-option v-for="c in MESSAGE_CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="Title">
          <el-input v-model="msg.title" maxlength="60" data-test="msg-title" />
        </el-form-item>
        <el-form-item label="Text">
          <el-input v-model="msg.body" type="textarea" maxlength="300" data-test="msg-body" />
        </el-form-item>
        <el-form-item label="Link to">
          <el-select v-model="msg.linkType" data-test="msg-link" style="width: 100%">
            <el-option v-for="o in LINK_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="msg.linkType === 'payment'" label="Payment id">
          <el-input-number v-model="msg.linkId" :min="1" data-test="msg-link-id" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="msg-send" @click="sendMessage">Send</el-button>
        </el-form-item>
        <p class="hint">Messages must not contain an address. The server refuses text with street names, postcodes or unit numbers.</p>
      </el-form>
    </el-card>

    <el-card style="max-width: 900px; margin-top: 16px" shadow="never">
      <template #header>Booking request alert (until real requests, E6-1)</template>
      <el-form label-width="110px" data-test="alert-tool" @submit.prevent>
        <el-form-item label="Phone">
          <el-input v-model="ra.phone" placeholder="An approved caregiver's number" data-test="ra-phone" style="max-width: 300px" />
        </el-form-item>
        <el-form-item label="Request">
          <el-checkbox v-model="ra.urgent" data-test="ra-urgent">Urgent</el-checkbox>
          <span class="inline">Closes in</span>
          <el-input-number v-model="ra.minutesLeft" :min="1" :max="1440" data-test="ra-minutes" />
          <span class="inline">min · visits</span>
          <el-input-number v-model="ra.visits" :min="1" :max="30" data-test="ra-visits" />
        </el-form-item>
        <el-form-item label="First visit">
          <el-input v-model="ra.firstVisit" style="max-width: 160px" data-test="ra-first" />
          <span class="inline">Area</span>
          <el-input v-model="ra.area" style="max-width: 200px" data-test="ra-area" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="noWhatsapp" data-test="ra-no-whatsapp">Pretend this number has no WhatsApp (to see the SMS fallback)</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="ra-send" @click="sendAlert">Send alert</el-button>
          <el-button data-test="ra-run" @click="runDue">Send due reminders now</el-button>
          <el-button data-test="ra-log" @click="loadLog">Show alert log</el-button>
        </el-form-item>
        <p class="hint">A reminder goes out 10 minutes before the request closes (the server checks every 15 seconds). Set "closes in" to 11 minutes to see it within a minute.</p>
      </el-form>
      <el-table v-if="log.length" :data="log" size="small" data-test="alert-log" style="margin-top: 12px">
        <el-table-column prop="createdAt" label="Time" width="190" />
        <el-table-column prop="kind" label="Kind" width="150" />
        <el-table-column prop="channel" label="Channel" width="100" />
        <el-table-column prop="status" label="Status" width="90" />
        <el-table-column prop="detail" label="Detail" />
      </el-table>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Add a test booked visit (until real bookings, E6)</template>
      <el-form label-width="110px" data-test="visit-tool" @submit.prevent>
        <el-form-item label="Caregiver">
          <el-input v-model="tv.phone" placeholder="An approved caregiver's number" data-test="tv-phone" />
        </el-form-item>
        <el-form-item label="Date">
          <el-date-picker v-model="tv.date" type="date" value-format="YYYY-MM-DD" :clearable="false" data-test="tv-date" />
        </el-form-item>
        <el-form-item label="Start">
          <el-select v-model="tv.start" data-test="tv-start" style="width: 160px">
            <el-option v-for="o in START_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="Minutes">
          <el-input-number v-model="tv.minutes" :min="15" :max="300" :step="15" data-test="tv-minutes" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="tv-add" @click="addVisit">Add visit</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Mark an order settled (until settlement, E8/E9)</template>
      <el-form label-width="110px" data-test="settle-tool" @submit.prevent>
        <el-form-item label="Order number">
          <el-input v-model="orderNumber" placeholder="e.g. P20261101001 (shown on the order page)" data-test="settle-number" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="settle-run" @click="settle">Mark settled</el-button>
        </el-form-item>
        <p class="hint">If this is an invited friend's first order, both the friend and the inviter get RM10 credit.</p>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Make a request expire now (E6-1)</template>
      <el-form label-width="110px" data-test="expire-tool" @submit.prevent>
        <el-form-item label="Order number">
          <el-input v-model="expireNumber" placeholder="A paid order still waiting for the caregiver" data-test="expire-number" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="expire-run" @click="expire">Expire now</el-button>
        </el-form-item>
        <p class="hint">The caregiver's request moves to History as Expired. The refund for this comes in E6-3.</p>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Move a visit to start soon (E8-3)</template>
      <el-form label-width="110px" data-test="soon-tool" @submit.prevent>
        <el-form-item label="Order number">
          <el-input v-model="soonNumber" placeholder="An accepted order" data-test="soon-number" />
        </el-form-item>
        <el-form-item label="Visit">
          <el-input-number v-model="soonVisit" :min="1" :max="60" data-test="soon-visit" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="soon-run" @click="moveSoon">Start in 10 min</el-button>
        </el-form-item>
        <p class="hint">The visit moves to today, 10 minutes from now, so the caregiver can tap "I've arrived".</p>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Pass time for a visit (E11-4)</template>
      <el-form label-width="110px" data-test="shift-tool" @submit.prevent>
        <el-form-item label="Order number">
          <el-input v-model="shiftNumber" placeholder="A visit that has started or been arrived at" data-test="shift-number" />
        </el-form-item>
        <el-form-item label="Visit">
          <el-input-number v-model="shiftVisit" :min="1" :max="60" data-test="shift-visit" />
        </el-form-item>
        <el-form-item label="Minutes">
          <el-input-number v-model="shiftMinutes" :min="1" :max="240" data-test="shift-minutes" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="shift-run" @click="passTime">Pass time</el-button>
        </el-form-item>
        <p class="hint">As if these minutes had passed: the booked start, arrival and entry all move earlier. Use it to test waiting and overtime without waiting.</p>
      </el-form>
    </el-card>

    <el-card style="max-width: 640px; margin-top: 16px" shadow="never">
      <template #header>Make a report 12 h old (E9-2)</template>
      <el-form label-width="110px" data-test="due-tool" @submit.prevent>
        <el-form-item label="Order number">
          <el-input v-model="dueNumber" placeholder="A visit with a sent report" data-test="due-number" />
        </el-form-item>
        <el-form-item label="Visit">
          <el-input-number v-model="dueVisit" :min="1" :max="60" data-test="due-visit" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" data-test="due-run" @click="makeDue">Auto-confirm now</el-button>
        </el-form-item>
        <p class="hint">Moves the report's sent time back 12 h, so the visit confirms itself as if the owner did nothing.</p>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { MESSAGE_CATEGORIES, addDays, dayText, formatMyPhone, klDate, timeText, type AlertLogRow, type CaregiverStatus, type RequestAlert } from '@pawpal/shared';
import {
  LINK_OPTIONS,
  MESSAGE_ROLE_OPTIONS,
  START_OPTIONS,
  STATUS_OPTIONS,
  addTestVisit,
  expireRequest,
  visitShift,
  visitSoon,
  reportDue,
  markOrderSettled,
  alertLog,
  alertSummary,
  runDueAlerts,
  sendRequestAlert,
  sendTestMessage,
  setCaregiverStatus,
  setWhatsappUnreachable,
  type TestMessage,
} from '../api/dev';

const phone = ref('');
const status = ref<CaregiverStatus>('approved');
const reason = ref('');

const msg = reactive<TestMessage>({
  phone: '',
  role: '',
  category: 'order',
  title: 'Booking accepted',
  body: 'Your caregiver accepted the booking (3 visits).',
  linkType: '',
  linkId: null,
});

async function sendMessage() {
  try {
    const m = await sendTestMessage({ ...msg });
    ElMessage.success(`Message #${m.id} sent`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const ra = reactive<RequestAlert & { phone: string }>({ phone: '', urgent: true, minutesLeft: 24, visits: 3, firstVisit: '10/28 09:00', area: 'Mont Kiara' });
const noWhatsapp = ref(false);
const log = ref<AlertLogRow[]>([]);

async function sendAlert() {
  try {
    const { phone, ...request } = ra;
    await setWhatsappUnreachable(phone, noWhatsapp.value);
    const sent = await sendRequestAlert(phone, request);
    ElMessage.success(`Alert sent: ${alertSummary(sent)}${sent.reminderAt ? ' · reminder set' : ''}`);
    await loadLog();
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function runDue() {
  const { sent } = await runDueAlerts();
  ElMessage.success(`${sent} due ${sent === 1 ? 'reminder' : 'reminders'} sent`);
  if (ra.phone) await loadLog();
}

async function loadLog() {
  try {
    log.value = await alertLog(ra.phone);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const tv = reactive({ phone: '', date: addDays(klDate(new Date()), 1), start: 600, minutes: 45 });

async function addVisit() {
  try {
    const v = await addTestVisit(tv.phone, tv.date, tv.start, tv.minutes);
    ElMessage.success(`Test visit added: ${dayText(v.date)} ${timeText(v.start)}, ${v.minutes} min`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const orderNumber = ref('');

async function settle() {
  try {
    const r = await markOrderSettled(orderNumber.value);
    ElMessage.success(`Order ${r.number} settled${r.rewarded ? ' · invite credit given to both' : ''}`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const expireNumber = ref('');

async function expire() {
  try {
    const r = await expireRequest(expireNumber.value);
    ElMessage.success(`Request ${r.number} has expired`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const soonNumber = ref('');
const soonVisit = ref(1);

async function moveSoon() {
  try {
    const r = await visitSoon(soonNumber.value, soonVisit.value);
    ElMessage.success(`Visit ${soonVisit.value} of ${r.number} now starts at ${timeText(r.start)} today`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const shiftNumber = ref('');
const shiftVisit = ref(1);
const shiftMinutes = ref(35);

async function passTime() {
  try {
    const r = await visitShift(shiftNumber.value, shiftVisit.value, shiftMinutes.value);
    ElMessage.success(`${shiftMinutes.value} min passed for visit ${shiftVisit.value} of ${r.number}; it now started at ${timeText(r.start)}`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

const dueNumber = ref('');
const dueVisit = ref(1);

async function makeDue() {
  try {
    const r = await reportDue(dueNumber.value, dueVisit.value);
    ElMessage.success(`Visit ${dueVisit.value} of ${r.number} is now confirmed automatically`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function save() {
  try {
    const user = await setCaregiverStatus(phone.value, status.value, reason.value);
    ElMessage.success(`${formatMyPhone(user.phone)} is now: ${status.value}`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<style scoped>
.inline { margin: 0 8px; color: var(--el-text-color-regular); }
.hint { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
