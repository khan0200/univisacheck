<script setup lang="ts">
import { displayStatusText, statusBadgeColor, isSupplementStatus } from '~/utils/visa-status'

const props = defineProps<{ status: string | undefined | null }>()

const icon = computed(() => {
  const s = (props.status || '').toLowerCase()
  if (s.includes('approved') || s.includes('visa used')) return 'i-lucide-circle-check'
  if (s.includes('cancel') || s.includes('reject')) return 'i-lucide-circle-x'
  if (isSupplementStatus(s)) return 'i-lucide-alert-circle'
  if (s === 'pending' || s === 'unknown' || s === '' || s.includes('error')) return 'i-lucide-clock'
  if (s.includes('received') || s.includes('app/')) return 'i-lucide-archive-restore'
  return 'i-lucide-clock'
})
</script>

<template>
  <UBadge
    :color="statusBadgeColor(props.status)"
    variant="solid"
    class="gap-1"
  >
    <UIcon
      :name="icon"
      class="size-3.5"
    />
    {{ displayStatusText(props.status) }}
  </UBadge>
</template>
