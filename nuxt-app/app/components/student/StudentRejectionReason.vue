<script setup lang="ts">
import { parseRejectionReason } from '~/utils/visa-status'

const props = withDefaults(
  defineProps<{
    reason?: string | null
    compact?: boolean
    showTitle?: boolean
  }>(),
  {
    compact: false,
    showTitle: false
  }
)

const items = computed(() => parseRejectionReason(props.reason))
</script>

<template>
  <div v-if="items.length > 0" class="mt-1 text-xs">
    <!-- Reason items -->
    <div :class="props.compact ? 'space-y-1' : 'space-y-1.5'">
      <div
        v-for="(item, idx) in items"
        :key="idx"
        class="flex items-start gap-1.5 leading-snug break-words overflow-wrap-anywhere"
      >
        <!-- Red Iconed Number Badge -->
        <span
          v-if="item.number"
          class="inline-flex items-center justify-center size-4.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-600 text-white text-[10.5px] font-bold shrink-0 shadow-2xs select-none mt-0.5"
        >
          {{ item.number }}
        </span>
        <UIcon
          v-else-if="!props.showTitle"
          name="i-lucide-circle-x"
          class="size-3.5 text-danger-600 shrink-0 mt-0.5"
        />

        <!-- Reason text in black / dark-neutral -->
        <span class="text-neutral-900 dark:text-neutral-200 font-normal min-w-0 break-words overflow-wrap-anywhere">
          {{ item.text }}
        </span>
      </div>
    </div>
  </div>
</template>
