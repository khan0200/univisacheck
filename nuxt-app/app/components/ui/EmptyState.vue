<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
}>(), {
  icon: 'i-lucide-inbox'
})
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-16 px-4">
    <div class="flex items-center justify-center size-14 rounded-2xl bg-primary-50 dark:bg-white/5 text-primary-600 dark:text-secondary-300 mb-4">
      <UIcon :name="icon" class="size-7" />
    </div>
    <p class="font-medium text-[var(--color-text-primary)] dark:text-white">{{ title }}</p>
    <p v-if="description" class="text-sm text-[var(--color-text-secondary)] mt-1 max-w-sm">{{ description }}</p>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
