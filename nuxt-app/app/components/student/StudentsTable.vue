<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useWindowScroll, useWindowSize, useNow } from '@vueuse/core'
import type { Student } from '~/types/student'
import { formatTimestampCompact } from '~/utils/format'
import { getCancellationReason, getStatusDate } from '~/utils/visa-status'

const now = useNow({ interval: 10_000 })

const props = defineProps<{
  students: Student[]
  currentFilter: string
  checkingPassports: Map<string, 'queued' | 'processing'>
  disableVirtualScroll?: boolean
}>()

const emit = defineEmits<{
  'edit': [student: Student]
  'details': [student: Student]
  'delete': [student: Student]
  'refresh': [student: Student]
  'download-pdf': [student: Student]
  'toggle-select': [student: Student, checked: boolean]
  'toggle-pin': [student: Student]
  'deselect-all': []
}>()

const hasAnySelected = computed(() => props.students.some(s => s.batchSelected))

const showSelectColumn = computed(() => props.currentFilter === 'application' || props.currentFilter === 'pending')

const showAppliedColumn = computed(() => props.currentFilter !== 'pending')

const showPdfColumn = computed(() =>
  props.currentFilter === 'approved'
  || props.students.some((s) => {
    const status = (s.status || '').toLowerCase()
    return status.includes('approved') || status.includes('visa used')
  })
)

function isPdfEligible(student: Student) {
  const status = (student.status || '').toLowerCase()
  return status.includes('approved') || status.includes('visa used')
}

const showStatusDateColumn = computed(() => props.currentFilter === 'approved')

function onRowClick(student: Student, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('button, input, select, a')) return
  emit('details', student)
}

// ─── VIRTUAL SCROLL LOGIC ───
const containerRef = ref<HTMLElement | null>(null)
const containerTop = ref(300)

function updateContainerTop() {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerTop.value = rect.top + window.scrollY
  }
}

const { y } = useWindowScroll()
const { height: windowHeight } = useWindowSize()

const buffer = 15
const desktopRowHeight = 73
const mobileRowHeight = 175

const isMobile = computed(() => {
  if (import.meta.server) return false
  return window.innerWidth < 768
})

const itemHeight = computed(() => (isMobile.value ? mobileRowHeight : desktopRowHeight))

const startIndex = computed(() => {
  const relativeY = Math.max(0, y.value - containerTop.value)
  const index = Math.floor(relativeY / itemHeight.value) - buffer
  return Math.max(0, index)
})

const endIndex = computed(() => {
  const relativeY = Math.max(0, y.value - containerTop.value)
  const visibleCount = Math.ceil(windowHeight.value / itemHeight.value)
  const index = Math.floor(relativeY / itemHeight.value) + visibleCount + buffer
  return Math.min(props.students.length, index)
})

const visibleStudents = computed(() => {
  if (props.disableVirtualScroll) return props.students
  return props.students.slice(startIndex.value, endIndex.value)
})

const topSpacerHeight = computed(() =>
  props.disableVirtualScroll ? 0 : startIndex.value * desktopRowHeight
)
const topSpacerMobileHeight = computed(() =>
  props.disableVirtualScroll ? 0 : startIndex.value * mobileRowHeight
)
const bottomSpacerHeight = computed(() =>
  props.disableVirtualScroll ? 0 : Math.max(0, (props.students.length - endIndex.value) * desktopRowHeight)
)
const bottomSpacerMobileHeight = computed(() =>
  props.disableVirtualScroll ? 0 : Math.max(0, (props.students.length - endIndex.value) * mobileRowHeight)
)

const columnCount = computed(() => {
  let count = 5
  if (showAppliedColumn.value) count++
  if (showSelectColumn.value) count++
  if (showPdfColumn.value) count++
  return count
})

onMounted(() => {
  if (!props.disableVirtualScroll) {
    updateContainerTop()
    window.addEventListener('resize', updateContainerTop)
  }
})

onBeforeUnmount(() => {
  if (!props.disableVirtualScroll) {
    window.removeEventListener('resize', updateContainerTop)
  }
})

watch([() => props.students, () => props.currentFilter], () => {
  if (!props.disableVirtualScroll) {
    nextTick(updateContainerTop)
  }
}, { deep: false })
</script>

<template>
  <div
    ref="containerRef"
    class="w-full"
  >
    <!-- Mobile: card list (no horizontal scrolling/cut-off columns) -->
    <div
      :key="`m-${currentFilter}`"
      class="md:hidden space-y-3 p-3"
    >
      <div
        v-if="!disableVirtualScroll && topSpacerMobileHeight > 0"
        key="__top_spacer_mobile"
        :style="{ height: `${topSpacerMobileHeight}px` }"
      />
      <div
        v-for="student in visibleStudents"
        :key="student.passport"
        class="p-4 space-y-2.5 rounded-xl border border-neutral-300/90 dark:border-white/20 bg-white dark:bg-[var(--color-card-dark)] shadow-[0_4px_16px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.04)] dark:shadow-[0_6px_24px_rgba(0,0,0,0.5)] cursor-pointer active:bg-primary-50/60 dark:active:bg-white/[0.03]"
        @click="onRowClick(student, $event)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-bold text-[var(--color-text-primary)] dark:text-white break-words flex items-center gap-1.5">
              <UiCopyField
                :value="student.fullName"
                label="Copy name"
                :copy-id="`m-name-${student.passport}`"
              />
              <span
                v-if="student.flag"
                title="Flagged"
                class="text-sm select-none shrink-0"
              >🚩</span>
              <span
                v-if="student.refundApplication"
                title="Refund Application"
                class="text-sm select-none shrink-0"
              >💸</span>
              <UIcon
                v-if="student.pinned"
                name="i-lucide-pin"
                class="size-3.5 text-primary-700 dark:text-primary-400 shrink-0"
              />
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <StudentVisaTypeBadge :visa-type="student.visaType" />
              <span
                v-if="student.studentId"
                class="text-xs text-[var(--color-text-secondary)]"
              >
                <UiCopyField
                  :value="student.studentId"
                  label="Copy ID"
                  :copy-id="`m-sid-${student.passport}`"
                >
                  #{{ student.studentId }}
                </UiCopyField>
              </span>
            </div>
          </div>
          <input
            v-if="showSelectColumn"
            type="checkbox"
            class="mt-1 size-4 shrink-0 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
            :checked="Boolean(student.batchSelected)"
            :disabled="currentFilter !== 'application' && currentFilter !== 'pending'"
            @click.stop
            @change="emit('toggle-select', student, ($event.target as HTMLInputElement).checked)"
          >
        </div>

        <div class="flex items-center justify-between text-sm">
          <div>
            <div class="font-bold text-[var(--color-text-primary)] dark:text-white">
              <UiCopyField
                :value="student.passport"
                label="Copy passport"
                :copy-id="`m-pp-${student.passport}`"
              />
            </div>
            <div class="text-xs font-bold text-[var(--color-text-secondary)] mt-0.5">
              <UiCopyField
                :value="student.birthday"
                label="Copy birthday"
                :copy-id="`m-bd-${student.passport}`"
              />
            </div>
          </div>
          <StudentStatusBadge :status="student.status" />
        </div>

        <StudentRejectionReason
          v-if="getCancellationReason(student) && !(student.status || '').toLowerCase().includes('supplement')"
          :reason="getCancellationReason(student)"
          compact
        />

        <div class="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
          <span v-if="showAppliedColumn">Applied: {{ student.applicationDate || '--' }}</span>
          <span v-if="showStatusDateColumn">Status date: {{ getStatusDate(student) || '--' }}</span>
          <span
            v-else-if="checkingPassports.has(student.passport)"
            class="inline-flex items-center gap-1.5 text-xs"
          >
            <template v-if="checkingPassports.get(student.passport) === 'processing'">
              <UIcon
                name="i-lucide-loader-2"
                class="animate-spin size-3.5 text-primary-600 dark:text-primary-400 shrink-0"
              />
              <span class="text-primary-600 dark:text-primary-400 font-medium">Checking...</span>
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-clock"
                class="size-3.5 text-neutral-500 dark:text-neutral-400 shrink-0"
              />
              <span class="text-neutral-500 dark:text-neutral-400">Queued</span>
            </template>
          </span>
          <span
            v-else
            class="text-xs text-[var(--color-text-secondary)]"
          >
            <span>Checked: {{ formatTimestampCompact(student.lastChecked, now) }}</span>
          </span>
        </div>

        <div class="flex flex-col gap-1.5 pt-2.5 border-t border-neutral-200 dark:border-white/15 mt-2">
          <UButton
            v-if="showPdfColumn && isPdfEligible(student)"
            block
            :icon="student.visaType === 'E-Visa' ? 'i-lucide-info' : 'i-lucide-file-down'"
            color="neutral"
            variant="soft"
            class="justify-center"
            :class="{ 'text-warning-600 dark:text-warning-400': student.visaType === 'E-Visa' }"
            @click.stop="emit('download-pdf', student)"
          >
            {{ student.visaType === 'E-Visa' ? 'E-Visa PDF Info' : 'Download PDF' }}
          </UButton>
          <div class="grid grid-cols-2 gap-1.5">
            <UiLoadingButton
              block
              color="primary"
              class="text-white justify-center"
              :disabled="isPdfEligible(student)"
              :class="{ 'opacity-40 cursor-not-allowed pointer-events-none': isPdfEligible(student) }"
              :loading="checkingPassports.has(student.passport)"
              @click.stop="!isPdfEligible(student) && emit('refresh', student)"
            >
              Check
            </UiLoadingButton>
            <UButton
              block
              icon="i-lucide-eye"
              color="neutral"
              variant="soft"
              class="justify-center"
              aria-label="View details"
              @click.stop="emit('details', student)"
            >
              View
            </UButton>
          </div>
        </div>
      </div>
      <div
        v-if="!disableVirtualScroll && bottomSpacerMobileHeight > 0"
        key="__bottom_spacer_mobile"
        :style="{ height: `${bottomSpacerMobileHeight}px` }"
      />
    </div>

    <!-- Desktop/tablet: table -->
    <div class="hidden md:block overflow-x-auto">
      <table
        :key="`t-${currentFilter}`"
        class="w-full min-w-[1000px] text-sm border-collapse table-fixed"
      >
        <thead class="sticky top-0 z-10 bg-neutral-100/90 dark:bg-[#111928] backdrop-blur">
          <tr class="border-b border-neutral-300 dark:border-white/20 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] dark:text-neutral-300">
            <th class="px-3 py-1.5 min-w-[250px]">
              Name
            </th>
            <th class="px-3 py-1.5 w-32">
              Passport
            </th>
            <th class="px-3 py-1.5 w-40">
              Status
            </th>
            <th
              v-if="showAppliedColumn"
              class="px-3 py-1.5 w-28"
            >
              Applied
            </th>
            <th
              v-if="showStatusDateColumn"
              class="px-3 py-1.5 w-32"
            >
              Status Date
            </th>
            <th
              v-else
              class="px-3 py-1.5 w-52"
            >
              Checked
            </th>
            <th
              v-if="showSelectColumn"
              class="px-3 py-1.5 w-20 text-center"
            >
              <div class="flex items-center justify-center gap-1">
                <span>Select</span>
                <button
                  v-if="hasAnySelected"
                  type="button"
                  class="p-0.5 rounded text-neutral-500 hover:text-error-600 dark:text-neutral-400 dark:hover:text-error-400 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors"
                  title="Deselect all selected checkboxes"
                  @click.stop="emit('deselect-all')"
                >
                  <UIcon
                    name="i-lucide-square-x"
                    class="size-3.5"
                  />
                </button>
              </div>
            </th>
            <th
              v-if="showPdfColumn"
              class="px-3 py-1.5 w-16 text-center"
            >
              PDF
            </th>
            <th class="px-3 py-1.5 w-36 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200 dark:divide-white/10">
          <tr
            v-if="!disableVirtualScroll && topSpacerHeight > 0"
            key="__top_spacer_desktop"
            :style="{ height: `${topSpacerHeight}px` }"
          >
            <td
              :colspan="columnCount"
              style="padding: 0; border: 0;"
            />
          </tr>
          <tr
            v-for="student in visibleStudents"
            :key="student.passport"
            class="cursor-pointer transition-colors hover:bg-primary-50/60 dark:hover:bg-white/[0.03]"
            @click="onRowClick(student, $event)"
          >
            <td class="px-4 py-3 align-top">
              <div class="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
                <UiCopyField
                  :value="student.fullName"
                  label="Copy name"
                  :copy-id="`name-${student.passport}`"
                />
                <span
                  v-if="student.flag"
                  title="Flagged"
                  class="text-sm select-none shrink-0"
                >🚩</span>
                <span
                  v-if="student.refundApplication"
                  title="Refund Application"
                  class="text-sm select-none shrink-0"
                >💸</span>
                <UIcon
                  v-if="student.pinned"
                  name="i-lucide-pin"
                  class="size-3.5 text-primary-700 dark:text-primary-400 shrink-0"
                />
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-1">
                <StudentVisaTypeBadge :visa-type="student.visaType" />
                <span
                  v-if="student.studentId"
                  class="text-xs text-[var(--color-text-secondary)]"
                >
                  <UiCopyField
                    :value="student.studentId"
                    label="Copy ID"
                    :copy-id="`sid-${student.passport}`"
                  >
                    #{{ student.studentId }}
                  </UiCopyField>
                </span>
                <span
                  v-if="student.applicationNo"
                  class="text-xs text-[var(--color-text-secondary)]"
                >
                  <UiCopyField
                    :value="student.applicationNo"
                    label="Copy application number"
                    :copy-id="`appno-${student.passport}`"
                  />
                </span>
              </div>
              <StudentRejectionReason
                v-if="getCancellationReason(student) && !(student.status || '').toLowerCase().includes('supplement')"
                :reason="getCancellationReason(student)"
                compact
              />
            </td>
            <td class="px-4 py-3 align-middle whitespace-nowrap">
              <div class="font-bold text-[var(--color-text-primary)] dark:text-white">
                <UiCopyField
                  :value="student.passport"
                  label="Copy passport"
                  :copy-id="`pp-${student.passport}`"
                />
              </div>
              <div class="text-xs font-bold text-[var(--color-text-secondary)] mt-0.5">
                <UiCopyField
                  :value="student.birthday"
                  label="Copy birthday"
                  :copy-id="`bd-${student.passport}`"
                />
              </div>
            </td>
            <td class="px-4 py-3 align-middle">
              <StudentStatusBadge :status="student.status" />
            </td>
            <td
              v-if="showAppliedColumn"
              class="px-4 py-3 align-middle whitespace-nowrap text-[var(--color-text-secondary)]"
            >
              {{ student.applicationDate || '--' }}
            </td>
            <td
              v-if="showStatusDateColumn"
              class="px-4 py-3 align-middle whitespace-nowrap text-[var(--color-text-secondary)]"
            >
              {{ getStatusDate(student) || '--' }}
            </td>
            <td
              v-else
              class="px-4 py-3 align-middle whitespace-nowrap text-[var(--color-text-secondary)]"
            >
              <span
                v-if="checkingPassports.has(student.passport)"
                class="inline-flex items-center gap-1.5 text-xs"
              >
                <template v-if="checkingPassports.get(student.passport) === 'processing'">
                  <UIcon
                    name="i-lucide-loader-2"
                    class="animate-spin size-3.5 text-primary-600 dark:text-primary-400 shrink-0"
                  />
                  <span class="text-primary-600 dark:text-primary-400 font-medium">Checking...</span>
                </template>
                <template v-else>
                  <UIcon
                    name="i-lucide-clock"
                    class="size-3.5 text-neutral-500 dark:text-neutral-400 shrink-0"
                  />
                  <span class="text-neutral-500 dark:text-neutral-400">Queued</span>
                </template>
              </span>
              <span
                v-else
                class="text-xs text-[var(--color-text-secondary)]"
              >
                <span>{{ formatTimestampCompact(student.lastChecked, now) }}</span>
              </span>
            </td>
            <td
              v-if="showSelectColumn"
              class="px-4 py-3 align-middle text-center"
            >
              <input
                type="checkbox"
                class="size-6 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                :checked="Boolean(student.batchSelected)"
                :disabled="currentFilter !== 'application' && currentFilter !== 'pending'"
                @change="emit('toggle-select', student, ($event.target as HTMLInputElement).checked)"
              >
            </td>
            <td
              v-if="showPdfColumn"
              class="px-4 py-3 align-middle text-center"
            >
              <button
                v-if="isPdfEligible(student)"
                type="button"
                class="text-primary-700 dark:text-secondary-300 hover:text-primary-900 dark:hover:text-white transition-colors"
                :class="{ 'text-warning-600 dark:text-warning-400': student.visaType === 'E-Visa' }"
                :title="student.visaType === 'E-Visa' ? 'E-Visa PDF: request from university' : 'Download Visa PDF'"
                @click="emit('download-pdf', student)"
              >
                <UIcon
                  :name="student.visaType === 'E-Visa' ? 'i-lucide-info' : 'i-lucide-file-down'"
                  class="size-6"
                />
              </button>
            </td>
            <td class="p-0 align-top w-px h-px [border-top-width:0]">
              <div class="flex items-stretch justify-end h-full">
                <UiLoadingButton
                  color="primary"
                  class="text-white justify-center rounded-none px-5 h-full py-2"
                  :disabled="isPdfEligible(student)"
                  :class="{ 'opacity-40 cursor-not-allowed pointer-events-none': isPdfEligible(student) }"
                  :loading="checkingPassports.has(student.passport)"
                  @click.stop="!isPdfEligible(student) && emit('refresh', student)"
                >
                  Check
                </UiLoadingButton>
                <UButton
                  icon="i-lucide-eye"
                  square
                  class="justify-center rounded-none px-4 h-full py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 transition-colors"
                  :ui="{ leadingIcon: 'size-5 text-amber-950 dark:text-slate-950' }"
                  aria-label="View details"
                  @click.stop="emit('details', student)"
                />
              </div>
            </td>
          </tr>
          <tr
            v-if="!disableVirtualScroll && bottomSpacerHeight > 0"
            key="__bottom_spacer_desktop"
            :style="{ height: `${bottomSpacerHeight}px` }"
          >
            <td
              :colspan="columnCount"
              style="padding: 0; border: 0;"
            />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
