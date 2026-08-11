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
    case 'connected': return 'bg-emerald-500'
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
      v-if="status === 'connected'"
      class="relative flex size-1.5 shrink-0"
    >
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span class="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
    </span>
    <span
      v-else
      class="size-1.5 rounded-full shrink-0 transition-colors duration-300"
      :class="dotClass"
    />
  </div>
</template>
