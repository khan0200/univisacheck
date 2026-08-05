<script setup lang="ts">
const props = defineProps<{ visaType: string | undefined | null }>()
const isEVisa = computed(() => props.visaType === 'E-Visa')
</script>

<template>
  <UBadge :color="isEVisa ? 'primary' : 'neutral'" variant="solid" size="sm" class="gap-1">
    <UIcon :name="isEVisa ? 'i-lucide-globe' : 'i-lucide-building-2'" class="size-3" />
    {{ isEVisa ? 'E-Visa' : 'Embassy' }}
  </UBadge>
</template>
