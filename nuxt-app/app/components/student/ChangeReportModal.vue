<script setup lang="ts">
import { displayStatusText, statusBadgeColor } from '~/utils/visa-status'

const studentsStore = useStudentsStore()
const open = computed({
  get: () => studentsStore.showReportModal,
  set: (val) => {
    studentsStore.showReportModal = val
  }
})

function close() {
  studentsStore.showReportModal = false
  studentsStore.sessionChanges = []
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{
      content: 'sm:max-w-xl border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl bg-white dark:bg-[#121824]'
    }"
    @update:open="open = $event"
  >
    <template #body>
      <div class="space-y-6">
        <!-- Premium Header Area -->
        <div class="flex items-start gap-4">
          <div class="flex items-center justify-center size-12 rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 shrink-0 shadow-inner">
            <UIcon name="i-lucide-clipboard-check" class="size-6 animate-pulse" />
          </div>
          <div class="space-y-1">
            <h3 class="text-lg font-bold text-neutral-900 dark:text-white leading-none">
              Hisobot: Viza holati o'zgarishi
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              Oxirgi tekshiruv davomida <span class="font-bold text-primary-600 dark:text-primary-400">{{ studentsStore.sessionChanges.length }} ta</span> o'zgarish aniqlandi.
            </p>
          </div>
        </div>

        <!-- Student Change Cards -->
        <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          <div
            v-for="change in studentsStore.sessionChanges"
            :key="change.fullName"
            class="group relative overflow-hidden rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-4 transition-all duration-300 hover:shadow-md hover:border-neutral-300 dark:hover:border-white/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            :class="{
              'border-l-4 border-l-success-500': statusBadgeColor(change.newStatus) === 'success',
              'border-l-4 border-l-danger-500': statusBadgeColor(change.newStatus) === 'error'
            }"
          >
            <!-- Left Side: Student Info -->
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <UIcon
                  v-if="statusBadgeColor(change.newStatus) === 'success'"
                  name="i-lucide-check-circle-2"
                  class="size-4 text-success-500 shrink-0"
                />
                <UIcon
                  v-else
                  name="i-lucide-x-circle"
                  class="size-4 text-danger-500 shrink-0"
                />
                <span class="font-bold text-neutral-800 dark:text-neutral-100 text-sm leading-snug break-words">
                  {{ change.fullName }}
                </span>
              </div>
            </div>

            <!-- Right Side: Clean Transition Badges -->
            <div class="flex items-center gap-2.5 self-start sm:self-center">
              <!-- Old Status -->
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {{ displayStatusText(change.oldStatus) }}
              </span>

              <!-- Transition Arrow -->
              <UIcon
                name="i-lucide-move-right"
                class="size-4 text-neutral-400 shrink-0"
              />

              <!-- New Status -->
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm"
                :class="{
                  'bg-success-500/10 text-success-700 dark:text-success-300 border border-success-500/20': statusBadgeColor(change.newStatus) === 'success',
                  'bg-danger-500/10 text-danger-700 dark:text-danger-300 border border-danger-500/20': statusBadgeColor(change.newStatus) === 'error'
                }"
              >
                {{ displayStatusText(change.newStatus) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-end w-full">
        <UButton
          color="primary"
          size="lg"
          class="px-6 text-white font-semibold rounded-xl shadow-lg hover:shadow-primary-500/10 transition-all"
          @click="close"
        >
          Tushunarli
        </UButton>
      </div>
    </template>
  </UModal>
</template>
