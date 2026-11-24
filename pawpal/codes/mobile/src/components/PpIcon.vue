<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="weight" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="pp-icon">
    <path v-for="d in ICONS[name]" :key="d" :d="d" />
  </svg>
</template>

<script setup lang="ts">
import { ICONS, type IconName } from '@pawpal/shared';

withDefaults(defineProps<{ name: IconName; size?: number; weight?: number }>(), { size: 22, weight: 2 });
</script>

<style>
.pp-icon { flex-shrink: 0; display: block; }
</style>
