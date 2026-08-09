<script setup lang="ts">
import type { RealtimeStatus } from '~/composables/useRealtimeSync'

const props = defineProps<{
  status: RealtimeStatus
}>()

const label = computed(() => {
  switch (props.status) {
    case 'connected': return 'Live'
    case 'reconnecting': return 'Reconnecting…'
    case 'offline': return 'Offline'
    default: return 'Connecting…'
  }
})

const dotClass = computed(() => {
  switch (props.status) {
    case 'connected': return 'bg-emerald-500 animate-pulse'
    case 'reconnecting': return 'bg-amber-400 animate-pulse'
    case 'offline': return 'bg-red-500'
    default: return 'bg-neutral-400 animate-pulse'
  }
})
</script>

<template>
  <div
    class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium select-none"
    :title="`Realtime sync: ${label}`"
    aria-live="polite"
  >
    <span
      class="size-1.5 rounded-full shrink-0 transition-colors duration-300"
      :class="dotClass"
    />
    <span class="hidden sm:inline text-[var(--color-text-secondary)] dark:text-white/50 transition-colors duration-300">
      {{ label }}
    </span>
  </div>
</template>
