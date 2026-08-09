<script setup lang="ts">
withDefaults(defineProps<{ rows?: number, cols?: number }>(), { rows: 6, cols: 6 })
</script>

<template>
  <div class="divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
    <div
      v-for="row in rows"
      :key="row"
      class="flex items-center gap-4 px-4 py-3.5"
    >
      <div
        v-for="col in cols"
        :key="col"
        class="h-3.5 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse"
        :style="{ width: col === 1 ? '18%' : `${10 + (col % 3) * 6}%` }"
      />
    </div>
  </div>
</template>
