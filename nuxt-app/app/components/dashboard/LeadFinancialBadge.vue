<script setup lang="ts">
import type { Lead } from '~/types/lead'
import { financialStatus } from '~/utils/lead-format'

const props = defineProps<{ lead: Lead }>()
const status = computed(() => financialStatus(props.lead))

const colorMap = {
  strong: 'success',
  medium: 'warning',
  weak: 'error',
  unknown: 'neutral'
} as const
</script>

<template>
  <UBadge
    :color="colorMap[status.cls]"
    variant="solid"
  >
    {{ status.label }}
  </UBadge>
</template>
