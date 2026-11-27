<template>
  <view v-if="draft" class="content has-bar">
    <view class="card">
      <view class="section"><text>Pets</text></view>
      <view class="choices">
        <view v-for="p in pets" :key="p.id" class="choice" :class="{ on: form.petIds.includes(p.id) }" :data-test="`pet-${p.id}`" @click="togglePet(p.id)">
          <text class="pet-dot">{{ p.name.slice(0, 1).toUpperCase() }}</text>{{ p.name }}<text class="tag"> · {{ p.kind === 'cat' ? 'Cat' : 'Dog' }}<template v-if="p.status !== 'approved'"> · {{ PET_STATUS_LABEL[p.status] }}</template></text>
        </view>
      </view>
      <text v-if="!pets.length" class="muted">No pets yet.</text>
      <text class="link" data-test="add-pet" @click="go('/pages/pets/edit')">+ Add a pet</text>
      <text class="muted">Max {{ DEFAULT_RULES.capacity.maxPets }} pets, max {{ DEFAULT_RULES.capacity.maxDogs }} dogs.</text>
    </view>

    <view v-if="levels.length" class="card">
      <view class="section"><text>Service</text></view>
      <view class="choices">
        <text v-for="l in levels" :key="l.value" class="choice" :class="{ on: form.level === l.value }" :data-test="`level-${l.value}`" @click="set({ level: l.value })">{{ l.label }}</text>
      </view>
    </view>

    <view class="card">
      <view class="section"><text>Dates and visits</text></view>
      <view class="row">
        <select v-model="pick.date" class="select" data-test="visit-date">
          <option v-for="d in dates" :key="d" :value="d">{{ dayText(d) }}</option>
        </select>
        <select v-model.number="pick.start" class="select" data-test="visit-start">
          <option v-for="m in starts" :key="m" :value="m">{{ timeText(m) }}</option>
        </select>
      </view>
      <button class="ghost" data-test="add-visit" @click="set({ visits: addVisit(form.visits, { ...pick }) })">Add visit</button>
      <view v-for="d in days" :key="d.date" class="day" :data-test="`day-${d.date}`">
        <text class="day-title">{{ d.title }}</text>
        <text v-for="v in d.visits" :key="v.start" class="visit" :data-test="`visit-${v.date}-${v.start}`" @click="set({ visits: removeVisit(form.visits, v) })">{{ v.time }} ✕</text>
      </view>
      <text class="muted">Up to {{ DEFAULT_RULES.booking.maxOrderDays }} dates, {{ DEFAULT_RULES.booking.maxVisitsPerDay }} visits a day. Visits start 7:00 am – 10:00 pm.</text>
    </view>

    <view class="card">
      <view class="section"><text>Overtime per visit (optional)</text></view>
      <view class="choices">
        <text v-for="o in OVERTIME_OPTIONS" :key="o.value" class="choice" :class="{ on: form.overtimeUnits === o.value }" :data-test="`ot-${o.value}`" @click="set({ overtimeUnits: o.value })">{{ o.label }}</text>
      </view>
      <text class="muted">RM10 per 15 min. Unused time is refunded.</text>
    </view>

    <view class="card">
      <view class="section"><text>Address</text></view>
      <select v-if="addresses.length" :value="form.addressId ?? ''" class="select" data-test="address" @change="set({ addressId: Number(($event.target as HTMLSelectElement).value) || null })">
        <option value="">Choose an address</option>
        <option v-for="a in addresses" :key="a.id" :value="a.id">{{ a.label }} · {{ a.area }}</option>
      </select>
      <text class="link" data-test="add-address" @click="go('/pages/addresses/edit')">+ Add an address</text>
    </view>

    <view class="card">
      <text class="section">Price per visit</text>
      <view v-for="l in draft.summary.lines" :key="`${l.date}-${l.start}`" class="line" data-test="line">
        <text class="strong">{{ l.label }}</text>
        <text class="muted">{{ lineText(l.quote) }}</text>
      </view>
      <view class="total"><text>Total</text><text data-test="total">{{ formatRM(draft.summary.total) }}</text></view>
      <text class="muted">Today's price. It is locked when you pay.</text>
      <text v-if="draft.summary.waitsForCheck.length" class="note" data-test="waits">{{ draft.summary.waitsForCheck.join(', ') }}: still being checked. You can pay once approved.</text>
    </view>

    <view v-if="draft.caregiver || draft.caregiverNote" class="card">
      <text class="section">Caregiver</text>
      <text v-if="draft.caregiver" class="strong" data-test="chosen">{{ draft.caregiver.displayName }}</text>
      <text v-if="draft.caregiverNote" class="note" data-test="caregiver-note">{{ draft.caregiverNote }}</text>
    </view>

    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <text class="hint" data-test="next-hint">{{ nextHint(draft) }}</text>
    <text v-if="draft.caregiver && !draft.summary.blocks.length" class="link center" data-test="change-caregiver" @click="go('/pages/booking/caregivers')">Change caregiver</text>
    <text class="link center" data-test="start-over" @click="startOver">Start over</text>
    <view class="bar">
      <view class="bar-total">
        <text class="muted">{{ draft.summary.lines.length }} {{ draft.summary.lines.length === 1 ? 'visit' : 'visits' }} · total</text>
        <text class="bar-sum">{{ formatRM(draft.summary.total) }}</text>
      </view>
      <button class="primary" data-test="next" :disabled="draft.summary.blocks.length > 0" @click="go(nextStep(draft).url)">{{ nextStep(draft).label }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { DEFAULT_RULES, EMPTY_DRAFT, PET_STATUS_LABEL, bookingDates, dayText, formatRM, startOptions, timeText, type Address, type BookingDraft, type DraftInput, type Pet, type RuleSet } from '@pawpal/shared';
import { listAddresses } from '@/api/addresses';
import { requireUser } from '@/api/auth';
import { clearDraft, getDraft, saveDraft } from '@/api/booking';
import { listPets } from '@/api/pets';
import { currentRules } from '@/api/rules';
import { trackStep } from '@/api/funnel';
import { OVERTIME_OPTIONS, addVisit, draftInput, levelOptions, lineText, nextHint, nextStep, removeVisit, visitDays } from '@/booking';

const draft = ref<BookingDraft | null>(null);
const form = ref<DraftInput>({ ...EMPTY_DRAFT });
const pets = ref<Pet[]>([]);
const addresses = ref<Address[]>([]);
const error = ref('');
const dates = ref<string[]>([]);
const starts = startOptions();
const pick = ref({ date: '', start: 540 });
let seq = 0;

const rules = ref<RuleSet>(DEFAULT_RULES);
const levels = computed(() => levelOptions(pets.value.filter((p) => form.value.petIds.includes(p.id)).map((p) => p.kind), rules.value));
const days = computed(() => visitDays(form.value.visits));

onShow(async () => {
  if (!(await requireUser('/pages/booking/index'))) return;
  void trackStep('setup');
  const [d, p, a, r] = await Promise.all([getDraft(), listPets(), listAddresses(), currentRules()]);
  rules.value = r;
  pets.value = p.filter((x) => x.status !== 'rejected');
  addresses.value = a;
  dates.value = bookingDates(new Date());
  if (!pick.value.date) pick.value.date = dates.value[1];
  show(d);
});

function show(d: BookingDraft) {
  draft.value = d;
  form.value = draftInput(d);
}

function go(url: string) {
  uni.navigateTo({ url });
}

function togglePet(id: number) {
  const ids = form.value.petIds;
  set({ petIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
}

/** Every change is saved at once; only the newest answer is shown. */
async function set(change: Partial<DraftInput>) {
  form.value = { ...form.value, ...change };
  error.value = '';
  const mine = ++seq;
  try {
    const d = await saveDraft(form.value);
    if (mine === seq) show(d);
  } catch (e) {
    if (mine === seq) error.value = (e as Error).message;
  }
}

async function startOver() {
  ++seq;
  show(await clearDraft());
}
</script>

<style>
.content { padding: 24rpx 32rpx; }
.content.has-bar { padding-bottom: calc(220rpx + env(safe-area-inset-bottom)); }
.card { display: flex; flex-direction: column; gap: 16rpx; margin-bottom: 20rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { display: flex; align-items: center; gap: 16rpx; font-weight: 700; font-size: 30rpx; }
.choices { display: flex; flex-wrap: wrap; gap: 16rpx; }
.choice { display: flex; align-items: center; gap: 12rpx; padding: 18rpx 28rpx; border: 2rpx solid var(--pp-border); border-radius: 12rpx; font-size: 27rpx; font-weight: 600; background: var(--pp-surface); }
.choice.on { border-color: var(--pp-primary-strong); background: var(--pp-primary-strong); color: var(--pp-surface); }
.choice.on .tag { color: var(--pp-primary-soft); }
.pet-dot { width: 52rpx; height: 52rpx; border-radius: 50%; background: var(--pp-primary-soft); color: var(--pp-primary-strong); font-weight: 800; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.choice.on .pet-dot { background: var(--pp-primary); color: var(--pp-ink); }
.tag { font-size: 22rpx; font-weight: 400; color: var(--pp-muted); }
.row { display: flex; gap: 16rpx; }
.select { flex: 1; height: 88rpx; padding: 0 20rpx; border: 2rpx solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; font-family: inherit; background: var(--pp-surface); color: var(--pp-ink); }
.ghost { background: var(--pp-surface); color: var(--pp-primary-strong); border: 2rpx solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-size: 28rpx; font-weight: 700; }
.day { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; padding: 16rpx 0; border-bottom: 1px dashed var(--pp-border); }
.day-title { width: 200rpx; font-weight: 700; font-size: 26rpx; }
.visit { padding: 10rpx 20rpx; border-radius: 12rpx; background: var(--pp-primary-soft); color: var(--pp-primary-strong); font-weight: 600; font-size: 24rpx; }
.line { display: flex; flex-direction: column; padding: 12rpx 0; border-bottom: 1px dashed var(--pp-border); }
.total { display: flex; justify-content: space-between; font-weight: 800; font-size: 34rpx; margin-top: 8rpx; }
.strong { font-weight: 700; font-size: 27rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.note { color: var(--pp-ink); font-size: 24rpx; padding: 16rpx 20rpx; background: var(--pp-primary-soft); border-radius: 12rpx; }
.link { color: var(--pp-primary-strong); font-weight: 700; font-size: 26rpx; }
.center { display: block; text-align: center; margin-top: 24rpx; }
.hint { display: block; text-align: center; color: var(--pp-muted); font-size: 26rpx; margin-bottom: 12rpx; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; margin-bottom: 12rpx; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; align-items: center; gap: 24rpx; padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); background: var(--pp-surface); border-top: 1px solid var(--pp-border); }
.bar-total { flex: 1; display: flex; flex-direction: column; }
.bar-sum { font-size: 40rpx; font-weight: 800; }
.bar .primary { flex: none; margin: 0; padding: 0 44rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 700; }
</style>
