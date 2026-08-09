<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useWindowScroll, useWindowSize } from '@vueuse/core'
import type { Student } from '~/types/student'
import { formatTimestampCompact } from '~/utils/format'
import { formatCancellationReason, getCancellationReason, getStatusDate } from '~/utils/visa-status'

const props = defineProps<{
  students: Student[]
  currentFilter: string
  checkingPassports: Map<string, 'queued' | 'processing'>
}>()

const emit = defineEmits<{
  'edit': [student: Student]
  'details': [student: Student]
  'delete': [student: Student]
  'refresh': [student: Student]
  'download-pdf': [student: Student]
  'toggle-select': [student: Student, checked: boolean]
  'toggle-pin': [student: Student]
}>()

const showSelectColumn = computed(() => props.currentFilter === 'application')

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

const MIN_DAYS_SINCE_APPLIED = 9

function isSelectable(_student: Student): boolean {
  return true
}

function onRowClick(student: Student, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('button, input, select, a')) return
  emit('details', student)
}

function getContextMenuItems(student: Student) {
  return [
    [
      {
        label: 'View',
        icon: 'i-lucide-eye',
        onSelect: () => emit('details', student)
      },
      {
        label: 'Edit',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('edit', student)
      }
    ],
    [
      {
        label: student.pinned ? 'Unpin from top' : 'Pin to top',
        icon: student.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin',
        onSelect: () => emit('toggle-pin', student)
      }
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        onSelect: () => emit('delete', student)
      }
    ]
  ]
}

// ─── 10-MINUTE AUTO-CHECK COUNTDOWN ───
const autoCheckRemainingSeconds = ref(600)
let autoCheckTimer: ReturnType<typeof setInterval> | null = null

function updateAutoCheckCountdown() {
  const now = new Date()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const secondsInCycle = (minutes % 10) * 60 + seconds
  const remaining = 600 - secondsInCycle
  autoCheckRemainingSeconds.value = remaining <= 0 ? 600 : remaining
}

const formattedAutoCheckTimer = computed(() => {
  const totalSec = autoCheckRemainingSeconds.value
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return `${mm}:${ss}`
})

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
  return props.students.slice(startIndex.value, endIndex.value)
})

const columnCount = computed(() => {
  let count = 5
  if (showAppliedColumn.value) count++
  if (showSelectColumn.value) count++
  if (showPdfColumn.value) count++
  return count
})

onMounted(() => {
  updateContainerTop()
  window.addEventListener('resize', updateContainerTop)

  updateAutoCheckCountdown()
  autoCheckTimer = setInterval(updateAutoCheckCountdown, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateContainerTop)

  if (autoCheckTimer) {
    clearInterval(autoCheckTimer)
    autoCheckTimer = null
  }
})

watch([() => props.students, () => props.currentFilter], () => {
  nextTick(updateContainerTop)
}, { deep: false })
</script>

<template>
  <div
    ref="containerRef"
    class="w-full"
  >
    <!-- Mobile: card list (no horizontal scrolling/cut-off columns) -->
    <div class="md:hidden space-y-3 p-3">
      <div :style="{ height: `${startIndex * mobileRowHeight}px` }" />
      <UContextMenu
        v-for="student in visibleStudents"
        :key="student.passport"
        :items="getContextMenuItems(student)"
      >
        <div
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
                <UIcon
                  v-if="student.pinned"
                  name="i-lucide-pin"
                  class="size-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
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
              :disabled="currentFilter !== 'application' || !isSelectable(student)"
              :title="!isSelectable(student) ? `Selectable ${MIN_DAYS_SINCE_APPLIED} days after application date` : undefined"
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

          <p
            v-if="getCancellationReason(student)"
            class="text-xs text-danger-600 leading-snug"
          >
            Rejected: {{ formatCancellationReason(getCancellationReason(student)) }}
          </p>

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
            <span v-else>Checked: {{ formatTimestampCompact(student.lastChecked) }}</span>
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
                :loading="checkingPassports.has(student.passport)"
                @click.stop="emit('refresh', student)"
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
      </UContextMenu>
      <div :style="{ height: `${Math.max(0, (props.students.length - endIndex) * mobileRowHeight)}px` }" />
    </div>

    <!-- Desktop/tablet: table -->
    <div class="hidden md:block overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 z-10 bg-neutral-100/90 dark:bg-[#111928] backdrop-blur">
          <tr class="border-b border-neutral-300 dark:border-white/20 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] dark:text-neutral-300">
            <th class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span>Name</span>
                <span
                  class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium tracking-normal normal-case text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/70 border border-emerald-300/80 dark:border-emerald-700/60 px-2 py-0.5 rounded-md shrink-0"
                  title="Automated visa check runs every 10 minutes"
                >
                  <UIcon
                    name="i-lucide-clock"
                    class="size-3 shrink-0 animate-pulse text-emerald-600 dark:text-emerald-400"
                  />
                  <span class="font-semibold text-neutral-600 dark:text-neutral-300">Auto Check:</span>
                  <span class="font-mono font-bold text-emerald-700 dark:text-emerald-300">{{ formattedAutoCheckTimer }}</span>
                </span>
              </div>
            </th>
            <th class="px-4 py-3">
              Passport
            </th>
            <th class="px-4 py-3">
              Status
            </th>
            <th
              v-if="showAppliedColumn"
              class="px-4 py-3"
            >
              Applied
            </th>
            <th
              v-if="showStatusDateColumn"
              class="px-4 py-3"
            >
              Status Date
            </th>
            <th
              v-else
              class="px-4 py-3"
            >
              Checked
            </th>
            <th
              v-if="showSelectColumn"
              class="px-4 py-3 text-center"
            >
              Select
            </th>
            <th
              v-if="showPdfColumn"
              class="px-4 py-3 text-center"
            >
              PDF
            </th>
            <th class="px-4 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200 dark:divide-white/10">
          <tr :style="{ height: `${startIndex * desktopRowHeight}px` }">
            <td
              :colspan="columnCount"
              style="padding: 0; border: 0;"
            />
          </tr>
          <UContextMenu
            v-for="student in visibleStudents"
            :key="student.passport"
            :items="getContextMenuItems(student)"
          >
            <tr
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
                  <UIcon
                    v-if="student.pinned"
                    name="i-lucide-pin"
                    class="size-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
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
                <p
                  v-if="getCancellationReason(student)"
                  class="text-xs text-danger-600 mt-1 max-w-xs leading-snug"
                >
                  Rejected: {{ formatCancellationReason(getCancellationReason(student)) }}
                </p>
              </td>
              <td class="px-4 py-3 align-top whitespace-nowrap">
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
              <td class="px-4 py-3 align-top">
                <StudentStatusBadge :status="student.status" />
              </td>
              <td
                v-if="showAppliedColumn"
                class="px-4 py-3 align-top whitespace-nowrap"
              >
                <UiCopyField
                  :value="student.applicationDate"
                  label="Copy applied date"
                  :copy-id="`ad-${student.passport}`"
                >
                  {{ student.applicationDate || '--' }}
                </UiCopyField>
              </td>
              <td
                v-if="showStatusDateColumn"
                class="px-4 py-3 align-top whitespace-nowrap text-[var(--color-text-secondary)]"
              >
                {{ getStatusDate(student) || '--' }}
              </td>
              <td
                v-else
                class="px-4 py-3 align-top whitespace-nowrap text-[var(--color-text-secondary)]"
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
                <span v-else>{{ formatTimestampCompact(student.lastChecked) }}</span>
              </td>
              <td
                v-if="showSelectColumn"
                class="px-4 py-3 align-top text-center"
              >
                <input
                  type="checkbox"
                  class="size-4 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  :checked="Boolean(student.batchSelected)"
                  :disabled="currentFilter !== 'application' || !isSelectable(student)"
                  :title="!isSelectable(student) ? `Selectable ${MIN_DAYS_SINCE_APPLIED} days after application date` : undefined"
                  @change="emit('toggle-select', student, ($event.target as HTMLInputElement).checked)"
                >
              </td>
              <td
                v-if="showPdfColumn"
                class="px-4 py-3 align-top text-center"
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
                    class="size-5"
                  />
                </button>
              </td>
              <td class="p-0 align-top w-px h-px [border-top-width:0]">
                <div class="flex items-stretch justify-end h-full">
                  <UiLoadingButton
                    color="primary"
                    class="text-white justify-center rounded-none px-5 h-full py-2"
                    :loading="checkingPassports.has(student.passport)"
                    @click.stop="emit('refresh', student)"
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
          </UContextMenu>
          <tr :style="{ height: `${Math.max(0, (props.students.length - endIndex) * desktopRowHeight)}px` }">
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
