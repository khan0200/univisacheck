<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string | undefined | null
  copyId: string
  bold?: boolean
}>()

const { copyValue, isCopied } = useCopyField()
const displayText = computed(() => (props.value && String(props.value).trim()) || '--')
const canCopy = computed(() => displayText.value !== '--')

function handleClick() {
  if (canCopy.value) copyValue(props.value, props.copyId)
}
</script>

<template>
  <button
    type="button"
    class="w-full text-left rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 transition-colors"
    :class="canCopy ? 'hover:border-primary-300 hover:bg-primary-50/50 dark:hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'"
    :disabled="!canCopy"
    @click="handleClick"
  >
    <div class="flex items-center justify-between gap-2 mb-1">
      <p class="text-xs text-[var(--color-text-secondary)]">
        {{ label }}
      </p>
      <UIcon
        v-if="canCopy"
        :name="isCopied(copyId) ? 'i-lucide-check' : 'i-lucide-copy'"
        class="size-3.5 shrink-0"
        :class="isCopied(copyId) ? 'text-success-500' : 'text-[var(--color-text-secondary)]'"
      />
    </div>
    <div
      class="text-sm text-[var(--color-text-primary)] dark:text-white"
      :class="bold ? 'font-bold' : 'font-medium'"
    >
      <slot>{{ displayText }}</slot>
    </div>
  </button>
</template>
