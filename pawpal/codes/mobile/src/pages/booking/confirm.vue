<template>
  <view v-if="draft" class="content">
    <view class="card">
      <text class="section">Caregiver</text>
      <text class="strong" data-test="caregiver">{{ draft.caregiver?.displayName ?? 'Not chosen yet' }}</text>
    </view>

    <view class="card">
      <text class="section">Visits</text>
      <text class="muted" data-test="pets">For {{ petNames || 'no pets yet' }}</text>
      <view v-for="l in draft.summary.lines" :key="`${l.date}-${l.start}`" class="line" data-test="line">
        <text class="strong">{{ l.label }}</text>
        <text class="muted">{{ lineText(l.quote) }}</text>
      </view>
      <view class="total"><text>{{ promo || creditSen ? 'Subtotal' : 'Total' }}</text><text data-test="total">{{ formatRM(draft.summary.total) }}</text></view>
      <view v-if="promo" class="discount"><text>Promo {{ promo.code }}</text><text data-test="discount">−{{ formatRM(promo.discountSen) }}</text></view>
      <view v-if="creditSen" class="discount"><text>Credit</text><text data-test="credit-used">−{{ formatRM(creditSen) }}</text></view>
      <view v-if="promo || creditSen" class="total"><text>To pay</text><text data-test="pay-total">{{ formatRM(payTotal) }}</text></view>
    </view>

    <view class="card">
      <text class="section">Promo code</text>
      <view v-if="promo" class="applied">
        <text class="strong" data-test="promo-applied">{{ promo.code }} applied</text>
        <text class="fix" data-test="remove-promo" @click="dropPromo">Remove</text>
      </view>
      <view v-else class="applied">
        <input v-model="code" class="input" data-test="promo-code" maxlength="16" placeholder="Enter a code">
        <button class="small" data-test="apply-promo" :disabled="!code.trim() || busy" @click="usePromo">Apply</button>
      </view>
      <text v-if="promoError" class="error" data-test="promo-error">{{ promoError }}</text>
      <text class="muted">One code per order.</text>
    </view>

    <view class="card">
      <text class="section">Getting in</text>
      <text class="strong" data-test="entry-method">{{ draft.entry ? ENTRY_METHOD_LABEL[draft.entry.method].title : 'Not set yet' }}</text>
      <text class="muted">🔒 Your instructions are hidden here. The caregiver sees them only after accepting.</text>
    </view>

    <view class="card">
      <text class="section">If you cancel</text>
      <text v-for="t in cancelPolicyText()" :key="t" class="muted" data-test="cancel-policy">• {{ t }}</text>
      <text class="note" data-test="not-accepted">{{ PAID_NOT_ACCEPTED }}</text>
    </view>

    <view class="card">
      <text class="section">Pay with</text>
      <view v-for="m in PAY_METHODS" :key="m" class="option" :class="{ on: method === m }" :data-test="`pay-${m}`" @click="method = m">
        <text class="strong">{{ method === m ? '◉' : '○' }} {{ PAYMENT_METHODS[m] }}</text>
      </view>
    </view>

    <view class="confirm" data-test="health" role="checkbox" :aria-checked="health" @click="health = !health">
      <view class="box" :class="{ on: health }">{{ health ? '✓' : '' }}</view>
      <text>{{ HEALTH_DECLARATION }}</text>
    </view>

    <view v-for="p in problems" :key="p.text" class="problem" data-test="problem">
      <text>{{ p.text }}</text>
      <text v-if="p.fix === 'promo'" class="fix" data-test="fix-promo" @click="dropPromo">Remove code ›</text>
      <text v-else class="fix" :data-test="`fix-${p.fix}`" @click="go(FIX_URL[p.fix].url)">{{ FIX_URL[p.fix].label }} ›</text>
    </view>
    <text v-if="error" class="error" data-test="error">{{ error }}</text>
    <button class="primary" data-test="pay" :disabled="busy || !health || problems.length > 0" @click="pay">Pay {{ formatRM(payTotal) }}</button>
    <text class="hint" data-test="pay-hint">{{ hint }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  ENTRY_METHOD_LABEL,
  HEALTH_DECLARATION,
  PAID_NOT_ACCEPTED,
  PAYMENT_METHODS,
  PAY_METHODS,
  cancelPolicyText,
  formatRM,
  type AppliedPromo,
  type BookingDraft,
  type PayProblem,
  type PaymentMethod,
  type Pet,
} from '@pawpal/shared';
import { requireUser } from '@/api/auth';
import { applyPromo, getCheckout, payNow, removePromo, type Checkout } from '@/api/booking';
import { ApiError } from '@/api/client';
import { listPets } from '@/api/pets';
import { FIX_URL, lineText } from '@/booking';
import { settleInputs } from '@/inputs';

const draft = ref<BookingDraft | null>(null);
const problems = ref<PayProblem[]>([]);
const promo = ref<AppliedPromo | null>(null);
const creditSen = ref(0);
const payTotal = ref(0);
const code = ref('');
const promoError = ref('');
const pets = ref<Pet[]>([]);
const method = ref<PaymentMethod>('tng');
const health = ref(false);
const busy = ref(false);
const error = ref('');

const petNames = computed(() => pets.value.filter((p) => draft.value?.petIds.includes(p.id)).map((p) => p.name).join(', '));
const hint = computed(() => (problems.value.length ? 'Fix the points above to pay.' : health.value ? 'Next: the payment page.' : 'Tick the health declaration to pay.'));

onShow(async () => {
  if (!(await requireUser('/pages/booking/confirm'))) return;
  await load();
});

async function load() {
  show(await getCheckout());
  pets.value = await listPets();
}

function show(c: Checkout) {
  draft.value = c.draft;
  problems.value = c.problems;
  promo.value = c.promo;
  creditSen.value = c.creditSen;
  payTotal.value = c.payTotal;
}

/** R23-3: only a code that works now is kept; the reason shows under the box. */
async function usePromo() {
  promoError.value = '';
  busy.value = true;
  try {
    await settleInputs();
    show(await applyPromo(code.value));
    code.value = '';
  } catch (e) {
    promoError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function dropPromo() {
  promoError.value = '';
  show(await removePromo());
}

async function pay() {
  error.value = '';
  busy.value = true;
  try {
    const { order, paymentId } = await payNow(method.value);
    uni.redirectTo({ url: `/pages/pay/test?order=${order.id}&payment=${paymentId}` });
  } catch (e) {
    // Something changed since the page opened (R21-3): show what to fix.
    if (e instanceof ApiError && e.code === 'PAY_BLOCKED') await load();
    else error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function go(url: string) {
  uni.navigateTo({ url });
}
</script>

<style>
.content { padding: 32rpx; }
.card { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { font-weight: 700; font-size: 30rpx; }
.line { display: flex; flex-direction: column; padding: 8rpx 0; border-bottom: 1px dashed var(--pp-border); }
.total { display: flex; justify-content: space-between; font-weight: 700; font-size: 32rpx; margin-top: 8rpx; }
.discount { display: flex; justify-content: space-between; font-size: 28rpx; color: var(--pp-primary-strong); }
.applied { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.input { flex: 1; height: 72rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 28rpx; text-transform: uppercase; }
.small { margin: 0; padding: 0 28rpx; font-size: 26rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); }
.option { padding: 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; }
.option.on { border-color: var(--pp-primary-strong); background: var(--pp-background); }
.confirm { display: flex; align-items: center; gap: 16rpx; margin: 8rpx 0 24rpx; font-size: 26rpx; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.problem { display: flex; justify-content: space-between; gap: 16rpx; margin-bottom: 16rpx; padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); color: var(--pp-danger); font-size: 26rpx; }
.fix { flex: none; color: var(--pp-primary-strong); font-weight: 600; }
.note { display: block; margin-top: 8rpx; padding: 16rpx 20rpx; border-radius: 12rpx; background: var(--pp-background); font-size: 24rpx; font-weight: 600; }
.strong { font-weight: 600; font-size: 28rpx; }
.muted { display: block; color: var(--pp-muted); font-size: 24rpx; }
.hint { display: block; text-align: center; color: var(--pp-muted); font-size: 26rpx; margin-top: 16rpx; }
.error { display: block; color: var(--pp-danger); font-size: 26rpx; margin-bottom: 12rpx; }
.primary { background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
</style>
