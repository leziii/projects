<template>
  <div>
    <h2>Action log</h2>
    <p class="muted">{{ ACTION_LOG_NOTE }}</p>
    <el-form inline data-test="action-filters" @submit.prevent="search">
      <el-form-item label="Admin">
        <el-select v-model="f.admin" clearable filterable placeholder="Anyone" style="width: 180px" data-test="filter-admin" @change="search">
          <el-option v-for="a in page.admins" :key="a" :label="a" :value="a" />
        </el-select>
      </el-form-item>
      <el-form-item label="Kind">
        <el-select v-model="f.kind" clearable placeholder="Any" style="width: 190px" data-test="filter-kind" @change="search">
          <el-option v-for="k in ACTION_KINDS" :key="k" :label="ACTION_KIND_LABEL[k]" :value="k" />
        </el-select>
      </el-form-item>
      <el-form-item label="When">
        <el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="From" end-placeholder="To" style="width: 240px" data-test="filter-dates" @change="search" />
      </el-form-item>
    </el-form>

    <el-table :data="page.rows" data-test="actions" style="max-width: 1300px" empty-text="No actions" @row-click="open">
      <el-table-column label="When" width="160">
        <template #default="{ row }">{{ row.at.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="Admin" width="140" prop="admin" />
      <el-table-column label="What" min-width="200">
        <template #default="{ row }">
          <span :class="{ link: row.link }">{{ row.what }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Change" width="200" prop="change" />
      <el-table-column label="Why" min-width="300" prop="reason" />
    </el-table>
    <el-pagination
      v-if="page.total > ACTION_LOG_RULES.pageSize"
      :current-page="f.page"
      layout="prev, pager, next, total"
      :page-size="ACTION_LOG_RULES.pageSize"
      :total="page.total"
      style="margin-top: 12px"
      data-test="action-pages"
      @current-change="go"
    />
    <p v-else class="muted" data-test="action-total">{{ page.total }} action{{ page.total === 1 ? '' : 's' }}</p>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ACTION_KINDS, ACTION_KIND_LABEL, ACTION_LOG_NOTE, ACTION_LOG_RULES, type ActionLogPage, type ActionLogRow } from '@pawpal/shared';
import { listActions, type ActionFilters } from '../api/actions';

/** E14-4 (R60-2 … R60-4): every admin action, newest first; read only. */
const router = useRouter();
const f = reactive<ActionFilters>({ admin: '', kind: '', from: '', to: '', page: 1 });
const dates = ref<[string, string] | null>(null);
const page = ref<ActionLogPage>({ rows: [], total: 0, page: 1, admins: [] });
const error = ref('');

async function load() {
  f.from = dates.value?.[0] ?? '';
  f.to = dates.value?.[1] ?? '';
  f.admin = f.admin ?? '';
  f.kind = f.kind ?? '';
  try {
    page.value = await listActions(f);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function search() {
  f.page = 1;
  void load();
}

function go(p: number) {
  f.page = p;
  void load();
}

const open = (r: ActionLogRow) => {
  if (r.link) void router.push(r.link);
};

onMounted(load);
</script>

<style scoped>
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.error { color: var(--el-color-danger); }
.link { color: var(--el-color-primary); cursor: pointer; }
</style>
