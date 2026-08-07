<script setup lang="ts">
const props = defineProps<{
  value: string | undefined | null
  label: string
  copyId: string
}>()

const { copyValue, isCopied } = useCopyField()
const displayText = computed(() => (props.value && String(props.value).trim()) || '--')
const canCopy = computed(() => displayText.value !== '--')
</script>

<template>
  <span class="inline-flex items-center gap-1 group/copy">
    <span><slot>{{ displayText }}</slot></span>
    <button
      v-if="canCopy"
      type="button"
      class="inline-flex items-center gap-1 transition-colors opacity-70 hover:opacity-100"
      :class="isCopied(props.copyId) ? 'text-primary-600 dark:text-primary-400 opacity-100' : 'text-[var(--color-text-secondary)] hover:text-primary-700 dark:hover:text-secondary-300'"
      :title="label"
      :aria-label="label"
      @click.stop="copyValue(props.value, props.copyId)"
    >
      <span v-if="isCopied(props.copyId)" class="text-[10px] font-bold">Copied!</span>
      <UIcon :name="isCopied(props.copyId) ? 'i-lucide-check' : 'i-lucide-clipboard'" class="size-3.5" />
    </button>
  </span>
</template>
