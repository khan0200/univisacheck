<script setup lang="ts">
import { ADMISSION_DOCS, EMBASSY_STANDARD } from '~/data/document-checklists'

const emit = defineEmits<{
  'open-admission': []
  'open-embassy': []
}>()

const admissionCount = ADMISSION_DOCS.length
const admissionPreview = ADMISSION_DOCS.slice(0, 4)

const embassyDocs = [...EMBASSY_STANDARD.student, ...EMBASSY_STANDARD.parent]
const embassyCount = embassyDocs.length
const embassyPreview = embassyDocs.slice(0, 4)
</script>

<template>
  <section id="hujjatlar" class="max-w-7xl mx-auto px-3 sm:px-4 py-16 sm:py-20 scroll-mt-16">
    <div class="grid lg:grid-cols-[1fr_auto] gap-8 items-center mb-10">
      <div class="flex items-start gap-4">
        <div class="flex items-center justify-center size-12 rounded-2xl bg-primary-900 text-secondary-300 shrink-0">
          <UIcon name="i-lucide-file-text" class="size-6" />
        </div>
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)] dark:text-white">Kerakli hujjatlar</h2>
          <p class="text-sm text-[var(--color-text-secondary)] mt-1.5 max-w-md">Universitetga qabul va viza olish uchun zarur bo'lgan hujjatlar ro'yxati</p>
        </div>
      </div>
      <img src="/docs.png" alt="Documents" class="hidden lg:block h-24 w-auto object-contain">
    </div>

    <div class="grid sm:grid-cols-2 gap-4 sm:gap-5">
      <button
        type="button"
        class="text-left group rounded-2xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all"
        @click="emit('open-admission')"
      >
        <div class="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-xl bg-primary-900 text-secondary-300 shadow-sm shrink-0">
              <UIcon name="i-lucide-graduation-cap" class="size-5" />
            </div>
            <div>
              <h3 class="font-semibold text-sm text-[var(--color-text-primary)] dark:text-white">Qabul uchun hujjatlar</h3>
              <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">Universitet uchun</p>
            </div>
          </div>
          <UBadge color="primary" variant="solid" class="shrink-0">{{ admissionCount }} ta</UBadge>
        </div>

        <ul class="mt-4 mx-5 sm:mx-6 rounded-xl border border-dashed border-[var(--color-border)] dark:border-white/[0.08] divide-y divide-dashed divide-[var(--color-border)] dark:divide-white/[0.08] overflow-hidden">
          <li v-for="doc in admissionPreview" :key="doc" class="flex items-center gap-2.5 px-3.5 py-2.5 bg-primary-50/30 dark:bg-white/[0.02]">
            <UIcon name="i-lucide-file-check-2" class="size-3.5 text-primary-600 dark:text-secondary-300 shrink-0" />
            <span class="text-xs text-[var(--color-text-primary)] dark:text-white/90 truncate">{{ doc }}</span>
          </li>
          <li class="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-primary-50/60 dark:bg-white/5 text-xs font-semibold text-primary-700 dark:text-secondary-300 group-hover:gap-2.5 transition-all">
            Barcha {{ admissionCount }} ta hujjatni ko'rish <UIcon name="i-lucide-arrow-right" class="size-3.5" />
          </li>
        </ul>

        <div class="h-5" />
      </button>

      <button
        type="button"
        class="text-left group rounded-2xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all"
        @click="emit('open-embassy')"
      >
        <div class="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-xl bg-success-700 text-white shadow-sm shrink-0">
              <UIcon name="i-lucide-landmark" class="size-5" />
            </div>
            <div>
              <h3 class="font-semibold text-sm text-[var(--color-text-primary)] dark:text-white">Viza uchun hujjatlar</h3>
              <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">Elchixona uchun (D2-D4)</p>
            </div>
          </div>
          <UBadge color="success" variant="solid" class="shrink-0">{{ embassyCount }} tagacha</UBadge>
        </div>

        <ul class="mt-4 mx-5 sm:mx-6 rounded-xl border border-dashed border-[var(--color-border)] dark:border-white/[0.08] divide-y divide-dashed divide-[var(--color-border)] dark:divide-white/[0.08] overflow-hidden">
          <li v-for="doc in embassyPreview" :key="doc" class="flex items-center gap-2.5 px-3.5 py-2.5 bg-success-50/30 dark:bg-white/[0.02]">
            <UIcon name="i-lucide-file-check-2" class="size-3.5 text-success-600 dark:text-success-400 shrink-0" />
            <span class="text-xs text-[var(--color-text-primary)] dark:text-white/90 truncate">{{ doc }}</span>
          </li>
          <li class="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-success-50/60 dark:bg-white/5 text-xs font-semibold text-success-700 dark:text-success-400 group-hover:gap-2.5 transition-all">
            Barcha hujjatlarni ko'rish <UIcon name="i-lucide-arrow-right" class="size-3.5" />
          </li>
        </ul>

        <div class="h-5" />
      </button>
    </div>

    <div class="mt-6 flex items-start gap-3 p-4 rounded-xl bg-warning-50 dark:bg-warning-950/30 border border-warning-200 dark:border-warning-900">
      <UIcon name="i-lucide-info" class="size-4.5 text-warning-600 shrink-0 mt-0.5" />
      <p class="text-xs text-warning-800 dark:text-warning-300 leading-relaxed">
        Hujjatlar ro'yxati universitet va viza turiga qarab farq qilishi mumkin. Aniq ma'lumot uchun konsultatsiya oling.
      </p>
    </div>
  </section>
</template>
