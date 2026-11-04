<template>
  <el-result icon="warning" title="No access" data-test="no-access">
    <template #sub-title>
      <p>{{ page ? `You have no access to ${page}.` : 'Your account has no pages yet.' }} Ask the account owner to give you this page.</p>
    </template>
  </el-result>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ADMIN_PAGE_LABEL, ADMIN_PAGES, type AdminPage } from '@pawpal/shared';

const route = useRoute();
const page = computed(() => {
  const p = route.query.page as AdminPage;
  return ADMIN_PAGES.includes(p) ? ADMIN_PAGE_LABEL[p] : '';
});
</script>
