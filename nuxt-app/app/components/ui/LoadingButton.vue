<script setup lang="ts">
/**
 * Thin UButton wrapper that shows only a spinner (iOS-style loader-circle)
 * while loading, with NO layout shift — the button keeps its exact idle
 * size/shape at all times.
 *
 * `loading` is never passed to the real UButton (that's what caused the
 * pill-to-circle collapse and the duplicate-icon glitch in earlier
 * attempts), and the `icon` prop is intercepted here rather than forwarded
 * via $attrs — we render it ourselves in a #leading slot so we can fade it
 * out together with the label while loading, then overlay a single spinner
 * centered on top. The label/icon stay in the DOM (opacity-0, not removed),
 * so the box the browser lays out never changes.
 */
const props = defineProps<{ loading?: boolean, disabled?: boolean, icon?: string }>()
</script>

<template>
  <UButton
    v-bind="$attrs"
    :icon="icon"
    :loading="false"
    :disabled="disabled || loading"
    class="relative"
  >
    <template
      v-if="icon"
      #leading="{ ui }"
    >
      <UIcon
        :name="icon"
        :class="[ui.leadingIcon({}), { 'opacity-0': loading }]"
      />
    </template>
    <span :class="{ 'opacity-0': loading }"><slot /></span>

    <span
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-4 animate-spin"
      />
    </span>
  </UButton>
</template>
