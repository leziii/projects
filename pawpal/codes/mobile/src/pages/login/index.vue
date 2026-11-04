<template>
  <view class="content">
    <view class="head">
      <image class="logo" :src="logo" mode="aspectFit" />
      <text class="title">Log in to {{ BRAND.name }}</text>
      <text class="sub">Use your mobile number. No password needed.</text>
    </view>

    <view class="card">
      <text class="label">Mobile number</text>
      <view class="phone-row">
        <text class="prefix">+60</text>
        <input v-model="phone" class="input" data-test="phone" type="tel" placeholder="12-345 6789" maxlength="16">
      </view>

      <text class="label">SMS code</text>
      <view class="code-row">
        <input v-model="code" class="input" data-test="code" type="tel" placeholder="6 digits" :maxlength="AUTH_RULES.codeLength">
        <button class="ghost" data-test="get-code" :disabled="wait > 0 || sending" @click="getCode">
          {{ wait > 0 ? `Resend in ${wait} s` : sent ? 'Resend code' : 'Get code' }}
        </button>
      </view>
      <text v-if="devCode" class="dev" data-test="dev-code">Test code: {{ devCode }} (development only, no SMS sent)</text>

      <text class="label">Invite code (new accounts only)</text>
      <input v-model="invite" class="input full" data-test="invite-code" placeholder="Optional" :maxlength="REFERRAL_RULES.codeLength + 4">

      <view class="terms" data-test="terms" role="checkbox" :aria-checked="agreed" @click="agreed = !agreed">
        <view class="box" :class="{ on: agreed }">{{ agreed ? '✓' : '' }}</view>
        <text>I agree to the Terms of Use and Privacy Policy</text>
      </view>

      <text v-if="error" class="error" data-test="error">{{ error }}</text>

      <button class="primary" data-test="login" :disabled="!canLogin || busy" @click="submit">Log in</button>
    </view>

    <text class="note">After logging in you go back to what you were doing. You can browse services and prices without an account.</text>
    <text class="later" data-test="not-now" @click="notNow">Not now</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { AUTH_RULES, BRAND, INVITE_RESULT_TEXT, logoDataUrl, normalizeInvite, normalizeMyPhone, REFERRAL_RULES, safeRedirect } from '@pawpal/shared';
import { login, sendCode } from '@/api/auth';
import { settleInputs } from '@/inputs';

const logo = logoDataUrl();
const phone = ref('');
const code = ref('');
const invite = ref('');
const agreed = ref(false);
const sent = ref(false);
const sending = ref(false);
const busy = ref(false);
const wait = ref(0);
const devCode = ref('');
const error = ref('');
let redirect = '/pages/index/index';
let timer: ReturnType<typeof setInterval> | undefined;

const canLogin = computed(() => agreed.value && normalizeMyPhone(phone.value) !== null && /^\d{6}$/.test(String(code.value).trim()));

function countdown(seconds: number) {
  wait.value = seconds;
  clearInterval(timer);
  timer = setInterval(() => {
    wait.value -= 1;
    if (wait.value <= 0) clearInterval(timer);
  }, 1000);
}

async function getCode() {
  error.value = '';
  sending.value = true;
  try {
    await settleInputs();
    const res = await sendCode(phone.value);
    sent.value = true;
    devCode.value = res.devCode ?? '';
    countdown(res.resendInSec);
  } catch (e) {
    error.value = (e as Error).message;
    const m = /wait (\d+) s/.exec(error.value);
    if (m) countdown(Number(m[1]));
  } finally {
    sending.value = false;
  }
}

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await settleInputs();
    const res = await login(phone.value, String(code.value).trim(), agreed.value, normalizeInvite(invite.value) || undefined);
    if (res.invite) {
      // E5-7: always say whether the invite code counted (R24-2), then carry on.
      uni.showModal({ title: res.invite === 'joined' ? 'Welcome to PawPal' : 'Invite code not used', content: INVITE_RESULT_TEXT[res.invite], showCancel: false, confirmText: 'OK', complete: () => uni.reLaunch({ url: redirect }) });
      return;
    }
    uni.showToast({ title: res.isNew ? 'Welcome to PawPal' : 'Logged in', icon: 'success' });
    uni.reLaunch({ url: redirect });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function notNow() {
  uni.reLaunch({ url: '/pages/index/index' });
}

onLoad((query) => {
  redirect = safeRedirect(query?.redirect as string | undefined);
  if (typeof query?.ref === 'string') invite.value = normalizeInvite(query.ref);
});
onUnload(() => clearInterval(timer));
</script>

<style>
.content { display: flex; flex-direction: column; padding: 48rpx 32rpx; }
.head { display: flex; flex-direction: column; align-items: center; margin-bottom: 12rpx; }
.logo { width: 128rpx; height: 128rpx; }
.title { margin-top: 16rpx; font-size: 44rpx; font-weight: 700; }
.sub { margin-top: 6rpx; color: var(--pp-muted); font-size: 26rpx; }
.card { margin-top: 28rpx; padding: 32rpx; background: var(--pp-surface); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-card); }
.label { display: block; font-weight: 600; font-size: 26rpx; margin: 12rpx 0 10rpx; }
.phone-row, .code-row { display: flex; align-items: center; gap: 16rpx; margin-bottom: 12rpx; }
.input.full { flex: none; display: block; margin-bottom: 12rpx; }
.prefix { padding: 18rpx 20rpx; background: var(--pp-background); border-radius: 12rpx; font-weight: 600; }
.input { flex: 1; height: 88rpx; padding: 0 20rpx; border: 1px solid var(--pp-border); border-radius: 12rpx; font-size: 30rpx; }
.ghost { margin: 0; flex: none; font-size: 26rpx; color: var(--pp-primary-strong); background: var(--pp-surface); border: 1px solid var(--pp-primary-strong); border-radius: var(--pp-radius-button); }
.dev { display: block; font-size: 24rpx; color: var(--pp-ink); background: var(--pp-background); padding: 12rpx 16rpx; border-radius: 12rpx; }
.terms { display: flex; align-items: center; gap: 16rpx; margin-top: 24rpx; font-size: 26rpx; }
.box { width: 40rpx; height: 40rpx; border: 2px solid var(--pp-primary-strong); border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: var(--pp-surface); font-size: 26rpx; flex: none; }
.box.on { background: var(--pp-primary-strong); }
.error { display: block; margin-top: 20rpx; color: var(--pp-danger); font-size: 26rpx; }
.primary { margin-top: 28rpx; background: var(--pp-primary-strong); color: var(--pp-surface); border-radius: var(--pp-radius-button); font-weight: 600; }
/* uni-app greys out disabled buttons; keep the brand colour, just faded. */
.primary[disabled] { background: var(--pp-primary-strong) !important; color: var(--pp-surface) !important; opacity: 0.45; }
.ghost[disabled] { background: var(--pp-surface) !important; color: var(--pp-muted) !important; border-color: var(--pp-border) !important; }
.note { margin-top: 28rpx; font-size: 24rpx; color: var(--pp-muted); text-align: center; }
.later { margin-top: 20rpx; text-align: center; color: var(--pp-primary-strong); font-weight: 600; }
</style>
