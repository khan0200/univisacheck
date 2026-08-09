<script setup lang="ts">
const props = defineProps<{ visaType: string | undefined | null }>()
const isEVisa = computed(() => props.visaType === 'E-Visa')
const isRegional = computed(() => props.visaType === 'Regional')
</script>

<template>
  <UBadge
    :color="isEVisa ? 'primary' : isRegional ? 'info' : 'neutral'"
    variant="solid"
    size="sm"
    class="gap-1"
  >
    <UIcon
      :name="isEVisa ? 'i-lucide-globe' : isRegional ? 'i-lucide-map' : 'i-lucide-building-2'"
      class="size-3"
    />
    {{ isEVisa ? 'E-Visa' : isRegional ? 'Regional' : 'Embassy' }}
  </UBadge>
</template>
