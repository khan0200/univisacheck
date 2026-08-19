<script setup lang="ts">
import { displayStatusText, statusBadgeColor } from '~/utils/visa-status'

const studentsStore = useStudentsStore()
const { checkMany } = useVisaCheck()

const activeTab = ref<'changes' | 'no-answers'>('changes')

// Watch when modal opens to pick the best active tab
watch(() => studentsStore.showReportModal, (isOpen) => {
  if (isOpen) {
    if (studentsStore.sessionChanges.length > 0) {
      activeTab.value = 'changes'
    } else if (studentsStore.sessionNoAnswers.length > 0) {
      activeTab.value = 'no-answers'
    } else {
      activeTab.value = 'changes'
    }
  }
})

const isRetrying = ref(false)
async function handleRetryNoAnswers() {
  if (studentsStore.sessionNoAnswers.length === 0) return

  const passportsToRetry = new Set(studentsStore.sessionNoAnswers.map(s => s.passport.toUpperCase().trim()))
  const studentsToRetry = studentsStore.students.filter(s => passportsToRetry.has(s.passport.toUpperCase().trim()))

  if (studentsToRetry.length === 0) return

  isRetrying.value = true
  try {
    studentsStore.showReportModal = false
    await checkMany(studentsToRetry)
  } finally {
    isRetrying.value = false
  }
}

function closeAndHardRefresh() {
  if (isRetrying.value) return
  studentsStore.showReportModal = false
  studentsStore.sessionChanges = []
  studentsStore.sessionNoAnswers = []

  if (typeof window !== 'undefined') {
    window.location.href = '/cabinet'
    window.location.reload()
  }
}

function handleOpenUpdate(val: boolean) {
  if (!val) {
    if (!isRetrying.value && studentsStore.showReportModal) {
      closeAndHardRefresh()
    }
  } else {
    studentsStore.showReportModal = true
  }
}
</script>

<template>
  <UModal
    :open="studentsStore.showReportModal"
    :ui="{
      content: 'sm:max-w-2xl border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl bg-white dark:bg-[#121824] overflow-hidden'
    }"
    @update:open="handleOpenUpdate"
  >
    <template #body>
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <div
              class="flex items-center justify-center size-12 rounded-2xl shrink-0 shadow-inner"
              :class="studentsStore.sessionNoAnswers.length > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-primary-500/10 text-primary-500'"
            >
              <UIcon
                :name="studentsStore.sessionNoAnswers.length > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-clipboard-check'"
                class="size-6"
              />
            </div>
            <div class="space-y-1">
              <h3 class="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                Viza tekshiruvi hisoboti
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                Jami <span class="font-bold text-neutral-900 dark:text-white">{{ studentsStore.sessionSummary.total }} ta</span> talaba tekshirildi (1 marta avtomatik qayta urinish bilan).
              </p>
            </div>
          </div>

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            class="rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 -mr-2 -mt-2 cursor-pointer"
            aria-label="Yopish"
            @click="closeAndHardRefresh"
          />
        </div>

        <!-- Summary KPI Metric Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <!-- Total Checked -->
          <div class="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] flex flex-col justify-between">
            <span class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Jami</span>
            <span class="text-xl font-bold text-neutral-900 dark:text-white mt-1">{{ studentsStore.sessionSummary.total }}</span>
          </div>

          <!-- Status Changed -->
          <div class="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col justify-between">
            <span class="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">O'zgargan</span>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{{ studentsStore.sessionChanges.length }}</span>
              <UIcon
                v-if="studentsStore.sessionChanges.length > 0"
                name="i-lucide-arrow-up-right"
                class="size-4 text-emerald-500"
              />
            </div>
          </div>

          <!-- Unchanged -->
          <div class="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] flex flex-col justify-between">
            <span class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">O'zgarmagan</span>
            <span class="text-xl font-bold text-neutral-700 dark:text-neutral-300 mt-1">{{ studentsStore.sessionSummary.unchanged }}</span>
          </div>

          <!-- No Answer / Timeout -->
          <div
            class="p-3 rounded-xl border flex flex-col justify-between"
            :class="studentsStore.sessionNoAnswers.length > 0 ? 'border-rose-500/30 bg-rose-500/5' : 'border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02]'"
          >
            <span
              class="text-[11px] font-medium uppercase tracking-wider"
              :class="studentsStore.sessionNoAnswers.length > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-neutral-500 dark:text-neutral-400'"
            >
              Javobsiz
            </span>
            <div class="flex items-center gap-1.5 mt-1">
              <span
                class="text-xl font-bold"
                :class="studentsStore.sessionNoAnswers.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-700 dark:text-neutral-300'"
              >
                {{ studentsStore.sessionNoAnswers.length }}
              </span>
              <UIcon
                v-if="studentsStore.sessionNoAnswers.length > 0"
                name="i-lucide-wifi-off"
                class="size-4 text-rose-500"
              />
            </div>
          </div>
        </div>

        <!-- Tab Controls (if both or any have items) -->
        <div class="flex items-center gap-2 border-b border-neutral-200 dark:border-white/10 pb-2">
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            :class="activeTab === 'changes'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'"
            @click="activeTab = 'changes'"
          >
            <UIcon
              name="i-lucide-sparkles"
              class="size-3.5"
            />
            <span>Viza o'zgarishlari</span>
            <span
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
              :class="activeTab === 'changes' ? 'bg-white/20 text-white' : 'bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300'"
            >
              {{ studentsStore.sessionChanges.length }}
            </span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            :class="activeTab === 'no-answers'
              ? 'bg-rose-500 text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'"
            @click="activeTab = 'no-answers'"
          >
            <UIcon
              name="i-lucide-alert-circle"
              class="size-3.5"
            />
            <span>Javob olinmaganlar</span>
            <span
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
              :class="activeTab === 'no-answers' ? 'bg-white/20 text-white' : 'bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300'"
            >
              {{ studentsStore.sessionNoAnswers.length }}
            </span>
          </button>
        </div>

        <!-- TAB CONTENT: Status Changes -->
        <div
          v-if="activeTab === 'changes'"
          class="space-y-3 max-h-[46vh] overflow-y-auto pr-1"
        >
          <div
            v-if="studentsStore.sessionChanges.length === 0"
            class="py-8 text-center space-y-2 border border-dashed border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50/50 dark:bg-white/[0.01]"
          >
            <UIcon
              name="i-lucide-check-circle-2"
              class="size-8 text-neutral-400 mx-auto"
            />
            <p class="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Ushbu tekshiruvda viza statuslarida yangi o'zgarish qayd etilmadi.
            </p>
          </div>

          <div
            v-for="change in studentsStore.sessionChanges"
            :key="change.passport || change.fullName"
            class="group relative overflow-hidden rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-3.5 transition-all duration-200 hover:shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            :class="{
              'border-l-4 border-l-emerald-500': statusBadgeColor(change.newStatus) === 'success',
              'border-l-4 border-l-rose-500': statusBadgeColor(change.newStatus) === 'error',
              'border-l-4 border-l-blue-500': statusBadgeColor(change.newStatus) === 'primary',
              'border-l-4 border-l-amber-500': statusBadgeColor(change.newStatus) === 'warning'
            }"
          >
            <!-- Left Side: Student Name & Passport -->
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <UIcon
                  v-if="statusBadgeColor(change.newStatus) === 'success'"
                  name="i-lucide-check-circle-2"
                  class="size-4 text-emerald-500 shrink-0"
                />
                <UIcon
                  v-else-if="statusBadgeColor(change.newStatus) === 'error'"
                  name="i-lucide-x-circle"
                  class="size-4 text-rose-500 shrink-0"
                />
                <UIcon
                  v-else-if="statusBadgeColor(change.newStatus) === 'warning'"
                  name="i-lucide-alert-circle"
                  class="size-4 text-warning-500 shrink-0"
                />
                <UIcon
                  v-else-if="statusBadgeColor(change.newStatus) === 'primary'"
                  name="i-lucide-file-check"
                  class="size-4 text-primary-500 shrink-0"
                />
                <UIcon
                  v-else
                  name="i-lucide-refresh-cw"
                  class="size-4 text-blue-500 shrink-0"
                />
                <span class="font-bold text-neutral-900 dark:text-neutral-100 text-sm leading-snug break-words">
                  {{ change.fullName }}
                </span>
              </div>
              <p
                v-if="change.passport"
                class="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 pl-6"
              >
                {{ change.passport }}
              </p>
            </div>

            <!-- Right Side: Transition Badges -->
            <div class="flex items-center gap-2 self-start sm:self-center shrink-0">
              <!-- Old Status -->
              <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {{ displayStatusText(change.oldStatus) }}
              </span>

              <!-- Transition Arrow -->
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5 text-neutral-400 shrink-0"
              />

              <!-- New Status -->
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm"
                :class="{
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20': statusBadgeColor(change.newStatus) === 'success',
                  'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20': statusBadgeColor(change.newStatus) === 'error',
                  'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20': statusBadgeColor(change.newStatus) === 'primary',
                  'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20': statusBadgeColor(change.newStatus) === 'warning',
                  'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300': statusBadgeColor(change.newStatus) === 'neutral'
                }"
              >
                {{ displayStatusText(change.newStatus) }}
              </span>
            </div>
          </div>
        </div>

        <!-- TAB CONTENT: No Answer / Timed Out -->
        <div
          v-if="activeTab === 'no-answers'"
          class="space-y-3 max-h-[46vh] overflow-y-auto pr-1"
        >
          <div
            v-if="studentsStore.sessionNoAnswers.length === 0"
            class="py-8 text-center space-y-2 border border-dashed border-emerald-500/20 rounded-xl bg-emerald-500/5"
          >
            <UIcon
              name="i-lucide-shield-check"
              class="size-8 text-emerald-500 mx-auto"
            />
            <p class="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Barcha tanlangan talabalarning viza ma'lumotlari portal orqali muvaffaqiyatli olindi!
            </p>
          </div>

          <div
            v-for="noAns in studentsStore.sessionNoAnswers"
            :key="noAns.passport"
            class="group relative overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/[0.03] dark:bg-rose-500/[0.05] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-l-4 border-l-rose-500"
          >
            <!-- Student Details -->
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-wifi-off"
                  class="size-4 text-rose-500 shrink-0"
                />
                <span class="font-bold text-neutral-900 dark:text-neutral-100 text-sm">
                  {{ noAns.fullName }}
                </span>
                <span class="font-mono text-xs px-2 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                  {{ noAns.passport }}
                </span>
              </div>
              <p class="text-xs text-rose-600 dark:text-rose-400 pl-6 flex items-center gap-1.5">
                <UIcon
                  name="i-lucide-clock"
                  class="size-3 shrink-0"
                />
                <span>10s timeout bo'ldi — 1 marta qayta tekshirildi, lekin javob bermadi</span>
              </p>
            </div>

            <!-- Status Pill -->
            <div class="self-start sm:self-center shrink-0">
              <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                Javob olinmadi
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full gap-3">
        <!-- Retry Failed Button (if any failed) -->
        <div>
          <UButton
            v-if="studentsStore.sessionNoAnswers.length > 0"
            color="warning"
            variant="soft"
            size="md"
            icon="i-lucide-rotate-ccw"
            :loading="isRetrying"
            @click="handleRetryNoAnswers"
          >
            Javobsizlarni qayta tekshirish ({{ studentsStore.sessionNoAnswers.length }})
          </UButton>
        </div>

        <UButton
          color="primary"
          size="lg"
          class="px-6 text-white font-semibold rounded-xl shadow-lg transition-all cursor-pointer"
          @click="closeAndHardRefresh"
        >
          Tushunarli
        </UButton>
      </div>
    </template>
  </UModal>
</template>
