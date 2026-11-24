<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="pp-icon">
    <path v-for="d in ICONS[name]" :key="d" :d="d" />
  </svg>
</template>

<script setup lang="ts">
import { ICONS, type IconName } from '@pawpal/shared';

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 });
</script>
