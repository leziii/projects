<template>
  <div class="login-page">
    <el-card class="login-card" shadow="never">
      <div class="head">
        <img :src="logo" alt="" width="44" height="44">
        <div>
          <h2>{{ BRAND.name }} Admin</h2>
          <p class="muted">Admin accounts only. App accounts cannot log in here.</p>
        </div>
      </div>
      <el-form label-position="top" data-test="admin-login" @submit.prevent="submit">
        <el-form-item label="Username">
          <el-input v-model="username" autocomplete="username" data-test="username" />
        </el-form-item>
        <el-form-item label="Password">
          <el-input v-model="password" type="password" show-password autocomplete="current-password" data-test="password" />
        </el-form-item>
        <el-form-item label="Authenticator code">
          <el-input v-model="code" inputmode="numeric" maxlength="6" placeholder="6 digits from your authenticator app" autocomplete="one-time-code" data-test="code" />
        </el-form-item>
        <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon data-test="login-error" style="margin-bottom: 16px" />
        <el-button type="primary" native-type="submit" :loading="busy" :disabled="!ready" data-test="login" style="width: 100%">Log in</el-button>
      </el-form>
      <p class="muted small">{{ ADMIN_RULES.maxWrongTries }} wrong tries lock the account for {{ ADMIN_RULES.lockMinutes }} minutes.</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_RULES, BRAND, logoDataUrl } from '@pawpal/shared';
import { adminLogin } from '../api/admin';
import { landingPath } from '../session';

const logo = logoDataUrl();
const route = useRoute();
const router = useRouter();
const username = ref('');
const password = ref('');
const code = ref('');
const error = ref('');
const busy = ref(false);
const ready = computed(() => username.value.trim() !== '' && password.value !== '' && /^\d{6}$/.test(code.value.trim()));

async function submit() {
  if (!ready.value) return;
  error.value = '';
  busy.value = true;
  try {
    const admin = await adminLogin(username.value, password.value, code.value.trim());
    await router.replace(landingPath(admin, typeof route.query.redirect === 'string' ? route.query.redirect : undefined));
  } catch (err) {
    error.value = (err as Error).message;
    code.value = '';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--pp-background); padding: 16px; box-sizing: border-box; }
.login-card { width: 100%; max-width: 400px; border-radius: 14px; }
.head { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
h2 { margin: 0; }
.muted { color: var(--pp-muted); margin: 4px 0 0; font-size: 13px; }
.small { margin-top: 12px; font-size: 12px; }
</style>
