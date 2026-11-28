<template>
  <router-view v-if="$route.meta.public" />
  <el-container v-else class="shell">
    <el-aside width="232px" class="side">
      <div class="brand" data-test="brand">
        <img :src="logo" alt="" width="36" height="36">
        <span class="brand-text">{{ BRAND.name }} <small>Admin</small></span>
      </div>
      <el-menu router :default-active="$route.path" data-test="menu">
        <el-menu-item-group v-for="g in groups" :key="g.title" :title="g.title">
          <el-menu-item v-for="m in g.items" :key="m.page" :index="m.path" :data-test="`menu-${m.page}`">
            <PpIcon :name="m.icon" class="menu-icon" />
            <span>{{ m.label }}</span>
          </el-menu-item>
        </el-menu-item-group>
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
import { menuGroups } from './session';
import PpIcon from './components/PpIcon.vue';

const logo = logoDataUrl();
const route = useRoute();
const router = useRouter();
const admin = ref<AdminUser | null>(null);
const groups = computed(() => (admin.value ? menuGroups(admin.value) : []));

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
body { margin: 0; font-family: var(--pp-font); color: var(--pp-ink); background: var(--pp-background); }
/* Menu and page scroll separately: the window never scrolls, each column does (KF, 28 Nov 2026). */
.shell { height: 100vh; overflow: hidden; }
.side { height: 100vh; overflow: hidden; background: var(--pp-surface); border-right: 1px solid var(--pp-border); padding: 0 12px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 10px; margin: 20px 8px 12px; }
.brand-text { display: flex; flex-direction: column; font-size: 18px; font-weight: 800; line-height: 1.15; }
.brand small { font-size: 12px; font-weight: 600; color: var(--pp-muted); }
.side .el-menu { background: transparent; border: 0; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.side .brand, .side .who { flex-shrink: 0; }
.side .el-menu-item-group__title { padding: 14px 0 4px 12px !important; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pp-muted); }
.side .el-menu-item { height: 40px; line-height: 40px; margin: 1px 0; padding: 0 12px !important; border-radius: 8px; font-weight: 500; color: var(--pp-ink); }
.side .el-menu-item:hover { background: var(--pp-background); }
.side .el-menu-item.is-active { background: var(--pp-primary-soft); color: var(--pp-ink); font-weight: 700; }
.side .el-menu-item.is-active .menu-icon { color: var(--pp-primary-strong); }
.menu-icon { margin-right: 10px; color: var(--pp-muted); flex-shrink: 0; }
.shell > .el-container, .shell > .el-main { height: 100vh; overflow-y: auto; overscroll-behavior: contain; }
.el-main { padding: 28px 32px; }
.el-card { border-radius: 10px; border-color: var(--pp-border); }
.who { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 16px 8px; border-top: 1px solid var(--pp-border); font-size: 13px; }
</style>
