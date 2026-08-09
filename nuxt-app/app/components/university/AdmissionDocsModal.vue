<script setup lang="ts">
import { ADMISSION_DOCS } from '~/data/document-checklists'
import { printChecklist } from '~/utils/print-checklist'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

function handleDownload() {
  printChecklist(
    'Universitetga topshirish hujjatlari',
    'Hujjat topshirish va qabul qilinish uchun zarur bo\'lgan asosiy hujjatlar ro\'yxati.',
    [{ title: 'Hujjatlar', docs: ADMISSION_DOCS.map(name => ({ name })) }]
  )
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Universitetga topshirish hujjatlari"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="flex items-start gap-3 mb-5 p-3.5 rounded-xl bg-primary-50 dark:bg-white/5">
        <div class="flex items-center justify-center size-9 rounded-lg bg-primary-900 text-secondary-300 shrink-0">
          <UIcon
            name="i-lucide-graduation-cap"
            class="size-4.5"
          />
        </div>
        <div>
          <p class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white">
            {{ ADMISSION_DOCS.length }} ta hujjat kerak
          </p>
          <p class="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
            Hujjat topshirish va qabul qilinish uchun zarur bo'lgan asosiy hujjatlar ro'yxati.
          </p>
        </div>
      </div>

      <ul class="grid sm:grid-cols-2 gap-2.5">
        <li
          v-for="(doc, i) in ADMISSION_DOCS"
          :key="doc"
          class="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)]"
        >
          <span class="flex items-center justify-center size-6 rounded-full bg-primary-50 dark:bg-white/10 text-primary-700 dark:text-secondary-300 text-[11px] font-bold shrink-0">
            {{ i + 1 }}
          </span>
          <span class="text-sm font-medium text-[var(--color-text-primary)] dark:text-white leading-snug">{{ doc }}</span>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
        >
          Yopish
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-download"
          @click="handleDownload"
        >
          PDF Checklist yuklab olish
        </UButton>
      </div>
    </template>
  </UModal>
</template>
