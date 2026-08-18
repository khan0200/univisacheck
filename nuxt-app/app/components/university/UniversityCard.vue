<script setup lang="ts">
import type { University } from '~/types/university'
import { programBadgesFor } from '~/composables/useUniversities'

const props = defineProps<{ university: University }>()
const emit = defineEmits<{ open: [university: University] }>()

const imgError = ref(false)

const programBadges = computed(() => programBadgesFor(props.university))

const normalizedImg = computed(() => {
  const img = props.university.img
  if (!img) return ''
  return img.startsWith('/') || img.startsWith('http') ? img : `/${img}`
})

const webpSrc = computed(() => {
  if (!normalizedImg.value || normalizedImg.value.startsWith('http')) return ''
  return normalizedImg.value.replace(/\.png$/, '.webp')
})
</script>

<template>
  <div class="group flex flex-col rounded-xl overflow-hidden bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] hover:shadow-lg hover:-translate-y-0.5 transition-all">
    <div class="relative h-40 bg-neutral-100 dark:bg-white/5 overflow-hidden">
      <picture v-if="normalizedImg && !imgError">
        <source
          v-if="webpSrc"
          :srcset="webpSrc"
          type="image/webp"
        >
        <img
          :src="normalizedImg"
          :alt="university.name"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          @error="imgError = true"
        >
      </picture>
      <div
        v-else
        class="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-white/5 dark:to-white/10"
      >
        <UIcon
          name="i-lucide-landmark"
          class="size-10 text-neutral-300 dark:text-white/20"
        />
      </div>
      <span class="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-black/55 text-white text-[10.5px] font-medium backdrop-blur-sm">
        <UIcon
          name="i-lucide-map-pin"
          class="size-3"
        />
        {{ university.location }}
      </span>
      <span
        class="absolute top-2.5 right-2.5 flex items-center justify-center size-8 rounded-full text-white shadow"
        :style="{ backgroundColor: university.brandColor }"
      >
        <UIcon
          name="i-lucide-shield-check"
          class="size-4"
        />
      </span>
    </div>

    <div class="flex-1 flex flex-col p-4">
      <h3 class="font-semibold text-sm text-[var(--color-text-primary)] dark:text-white leading-snug">
        {{ university.name }}
      </h3>
      <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">
        {{ university.koreanName }}
      </p>

      <div class="grid grid-cols-2 gap-2 mt-3">
        <div class="flex items-center gap-1.5">
          <UIcon
            name="i-lucide-star"
            class="size-3.5 text-secondary-500 shrink-0"
          />
          <span
            class="text-[11px] text-[var(--color-text-secondary)] truncate"
            :title="university.qsRank"
          >{{ university.qsRank }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <UIcon
            name="i-lucide-building-2"
            class="size-3.5 text-primary-500 shrink-0"
          />
          <span class="text-[11px] text-[var(--color-text-secondary)]">{{ university.founded }}</span>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5 mt-3">
        <span
          v-for="badge in programBadges"
          :key="badge.key"
          :class="['text-[10px] font-semibold px-2 py-1 rounded-sm', badge.class]"
        >
          {{ badge.label }}
        </span>
      </div>

      <button
        type="button"
        class="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-secondary-300 hover:gap-2.5 transition-all"
        @click="emit('open', university)"
      >
        Batafsil ma'lumot
        <UIcon
          name="i-lucide-arrow-right"
          class="size-3.5"
        />
      </button>
    </div>
  </div>
</template>
