<script setup lang="ts">
import { EMBASSY_1PERCENT, EMBASSY_STANDARD } from '~/data/document-checklists'
import { printChecklist } from '~/utils/print-checklist'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const tab = ref<'1percent' | 'standard'>('1percent')

const activeDocs = computed(() => (tab.value === '1percent' ? EMBASSY_1PERCENT : EMBASSY_STANDARD))

function handleDownload() {
  const label = tab.value === '1percent' ? '1% Universitetlar uchun' : 'Umumiy (Standart)'
  printChecklist(
    'Elchixona hujjatlari (D2-D4 vizasi)',
    `${label} — Elchixonaga topshirish uchun talab qilinadigan hujjatlar ro'yxati.`,
    [
      { title: 'TALABA HUJJATLARI', docs: activeDocs.value.student.map((name) => ({ name })) },
      { title: 'OTA-ONA HUJJATLARI', docs: activeDocs.value.parent.map((name) => ({ name })) }
    ]
  )
}
</script>

<template>
  <UModal :open="props.open" title="Elchixona hujjatlari (D2-D4 vizasi)" :ui="{ content: 'sm:max-w-2xl' }" @update:open="emit('update:open', $event)">
    <template #body>
      <p class="text-sm text-[var(--color-text-secondary)] mb-4">
        Elchixonaga topshirish uchun viza turlari bo'yicha talab qilinadigan hujjatlar ro'yxati.
      </p>

      <div class="grid grid-cols-2 gap-1 p-1 rounded-md bg-primary-50 dark:bg-white/5 mb-5">
        <button
          type="button"
          class="rounded-sm py-2 text-sm font-semibold transition-colors"
          :class="tab === '1percent' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
          @click="tab = '1percent'"
        >
          1% Universitetlar uchun
        </button>
        <button
          type="button"
          class="rounded-sm py-2 text-sm font-semibold transition-colors"
          :class="tab === 'standard' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
          @click="tab = 'standard'"
        >
          Umumiy (Standart)
        </button>
      </div>

      <div class="max-h-[28rem] overflow-y-auto space-y-5 pr-1">
        <div>
          <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-secondary-300 mb-2.5">
            <UIcon name="i-lucide-user" class="size-3.5" />
            Talaba hujjatlari
          </h4>
          <ul class="grid sm:grid-cols-2 gap-2.5">
            <li
              v-for="(doc, i) in activeDocs.student"
              :key="`s-${doc}`"
              class="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)]"
            >
              <span class="flex items-center justify-center size-6 rounded-full bg-primary-50 dark:bg-white/10 text-primary-700 dark:text-secondary-300 text-[11px] font-bold shrink-0">
                {{ i + 1 }}
              </span>
              <span class="text-sm font-medium text-[var(--color-text-primary)] dark:text-white leading-snug">{{ doc }}</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-success-700 dark:text-success-400 mb-2.5">
            <UIcon name="i-lucide-users" class="size-3.5" />
            Ota-ona hujjatlari
          </h4>
          <ul class="grid sm:grid-cols-2 gap-2.5">
            <li
              v-for="(doc, i) in activeDocs.parent"
              :key="`p-${doc}`"
              class="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)]"
            >
              <span class="flex items-center justify-center size-6 rounded-full bg-success-50 dark:bg-white/10 text-success-700 dark:text-success-400 text-[11px] font-bold shrink-0">
                {{ activeDocs.student.length + i + 1 }}
              </span>
              <span class="text-sm font-medium text-[var(--color-text-primary)] dark:text-white leading-snug">{{ doc }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">Yopish</UButton>
        <UButton color="primary" icon="i-lucide-download" @click="handleDownload">PDF Checklist yuklab olish</UButton>
      </div>
    </template>
  </UModal>
</template>
