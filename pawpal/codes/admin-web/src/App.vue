<template>
  <router-view v-if="$route.meta.public" />
  <el-container v-else style="min-height: 100vh">
    <el-aside width="180px" class="side">
      <div class="brand" data-test="brand">
        <img :src="logo" alt="" width="36" height="36">
        <span>{{ BRAND.name }} <small>Admin</small></span>
      </div>
      <el-menu router :default-active="$route.path" data-test="menu">
        <el-menu-item v-for="m in menu" :key="m.page" :index="m.path" :data-test="`menu-${m.page}`">{{ m.label }}</el-menu-item>
      </el-menu>
      <div v-if="admin" class="who">
        <span data-test="admin-name">{{ admin.name }}</span>
        <el-button link type="primary" data-test="logout" @click="logout">Log out</el-button>
      </div>
    </el-aside>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BRAND, logoDataUrl, type AdminUser } from '@pawpal/shared';
import { adminLogout, currentAdmin } from './api/admin';
import { menuFor } from './session';

const logo = logoDataUrl();
const route = useRoute();
const router = useRouter();
const admin = ref<AdminUser | null>(null);
const menu = computed(() => (admin.value ? menuFor(admin.value) : []));

// The router has already checked the login; read who it is for the menu.
watch(
  () => route.fullPath,
  async () => {
    admin.value = route.meta.public ? null : await currentAdmin();
  },
  { immediate: true },
);

async function logout() {
  await adminLogout();
  await router.replace('/login');
}
</script>

<style>
/* Brand values come from shared/src/brand.ts as --pp-* variables (set in applyBrand). */
body { margin: 0; font-family: var(--pp-font); color: var(--pp-ink); }
.side { background: var(--pp-background); padding: 0 16px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 10px; margin: 18px 0; font-size: 20px; font-weight: 700; }
.brand small { font-size: 12px; font-weight: 600; color: var(--pp-muted); }
.side .el-menu { background: transparent; border: 0; flex: 1; }
.who { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 16px 0; border-top: 1px solid var(--pp-border); font-size: 13px; }
</style>
