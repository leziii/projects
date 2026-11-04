<template>
  <view class="card" data-test="alerts">
    <text class="section">Alerts for new requests</text>

    <view class="row">
      <view class="text">
        <text class="name">Push on this phone</text>
        <text class="state" data-test="push-state">{{ pushLabel }}</text>
      </view>
      <button v-if="support === 'available'" class="small" :class="{ on: pushOn }" data-test="push-toggle" :disabled="busy" @click="togglePush">
        {{ pushOn ? 'Turn off' : 'Turn on' }}
      </button>
    </view>

    <view class="row">
      <view class="text">
        <text class="name">WhatsApp / SMS</text>
        <text class="state">To {{ phone }} · SMS if WhatsApp fails</text>
      </view>
      <switch :checked="settings?.textAlerts ?? true" data-test="text-toggle" :disabled="busy || !settings" @change="toggleText" />
    </view>

    <button class="ghost" data-test="test-alert" :disabled="busy" @click="test">Send me a test alert</button>
    <text v-if="result" class="result" data-test="test-result">{{ result }}</text>
    <text v-for="line in failures" :key="line" class="error" data-test="test-failure">{{ line }}</text>
    <text v-if="error" class="error" data-test="alerts-error">{{ error }}</text>
    <text class="note">You get a reminder 10 minutes before a request closes. Alerts never include an address.</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatMyPhone, type AlertSettings } from '@pawpal/shared';
import { PUSH_HINT, failureDetails, pushSupport, resultSummary, type PushSupport } from '@/alerts';
import { alertSettings, currentSubscription, sendTestAlert, setTextAlerts, turnOffPush, turnOnPush } from '@/api/alerts';
import { isStandalone } from '@/install';

const props = defineProps<{ userPhone: string }>();
const phone = computed(() => formatMyPhone(props.userPhone));
const settings = ref<AlertSettings | null>(null);
const pushOn = ref(false);
const busy = ref(false);
const result = ref('');
const failures = ref<string[]>([]);
const error = ref('');

const support = ref<PushSupport>('unsupported');
const pushLabel = computed(() => (support.value !== 'available' ? PUSH_HINT[support.value] : pushOn.value ? 'On' : 'Off'));

onMounted(async () => {
  const w = globalThis.window;
  support.value = pushSupport({
    userAgent: w?.navigator.userAgent ?? '',
    standalone: isStandalone(),
    hasServiceWorker: !!w && 'serviceWorker' in w.navigator,
    hasPush: !!w && 'PushManager' in w,
    permission: w && 'Notification' in w ? Notification.permission : null,
  });
  await run(async () => {
    settings.value = await alertSettings();
    pushOn.value = support.value === 'available' && !!(await currentSubscription());
  });
});

async function run(fn: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const togglePush = () =>
  run(async () => {
    if (!settings.value) return;
    settings.value = pushOn.value ? await turnOffPush() : await turnOnPush(settings.value.vapidPublicKey);
    pushOn.value = !pushOn.value;
    if (Notification.permission === 'denied') support.value = 'blocked';
  });

const toggleText = (e: Event) =>
  run(async () => {
    settings.value = await setTextAlerts((e as unknown as { detail: { value: boolean } }).detail.value);
  });

const test = () =>
  run(async () => {
    result.value = '';
    failures.value = [];
    const { results } = await sendTestAlert();
    result.value = `Test alert: ${resultSummary(results)}`;
    failures.value = failureDetails(results);
  });
</script>

<style>
.card { margin-top: 24rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.section { display: block; font-weight: 600; margin-bottom: 8rpx; }
.row { display: flex; align-items: center; gap: 20rpx; padding: 18rpx 0; border-bottom: 1px dashed var(--pp-border); }
.text { flex: 1; }
.name { display: block; }
.state { display: block; font-size: 24rpx; color: var(--pp-muted); }
.small { margin: 0; padding: 0 28rpx; font-size: 26rpx; line-height: 2.2; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); }
.small.on { background: var(--pp-surface); color: var(--pp-primary-strong); border: 1px solid var(--pp-primary-strong); }
.ghost { margin-top: 24rpx; color: var(--pp-primary-strong); background: var(--pp-surface); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); font-size: 28rpx; }
.result { display: block; margin-top: 12rpx; font-size: 26rpx; color: var(--pp-success); }
.error { display: block; margin-top: 12rpx; font-size: 26rpx; color: var(--pp-danger); }
.note { display: block; margin-top: 16rpx; font-size: 24rpx; color: var(--pp-muted); }
</style>
