<script setup lang="ts">
import type { VisaCheckApiResult, VisaCheckFormInput, VisaType } from '~/types/visa-check'
import { formatRelativeTime, statusConfigFor } from '~/utils/visa-check-status'

const props = defineProps<{
  result: VisaCheckApiResult
  input: VisaCheckFormInput
  visaType: VisaType
  cached: boolean
}>()

const { downloadPdfUrl } = useVisaCheckService()
const { copyValue, isCopied } = useCopyField()

const statusConfig = computed(() => statusConfigFor(props.result.status))

const iconMap: Record<string, string> = {
  check: 'i-lucide-check',
  search: 'i-lucide-search',
  clock: 'i-lucide-clock',
  inbox: 'i-lucide-archive-restore',
  x: 'i-lucide-x',
  pass: 'i-lucide-id-card'
}

/** Soft-tinted icon circle background — decorative, not a text pill. */
const colorMap: Record<string, string> = {
  approved: 'text-success-600 bg-success-50 border-success-200 dark:bg-success-950/40 dark:border-success-800',
  used: 'text-success-600 bg-success-50 border-success-200 dark:bg-success-950/40 dark:border-success-800',
  pending: 'text-warning-600 bg-warning-50 border-warning-200 dark:bg-warning-950/40 dark:border-warning-800',
  received: 'text-warning-600 bg-warning-50 border-warning-200 dark:bg-warning-950/40 dark:border-warning-800',
  review: 'text-primary-700 bg-primary-50 border-primary-200 dark:bg-primary-950/40 dark:border-primary-800',
  rejected: 'text-danger-600 bg-danger-50 border-danger-200 dark:bg-danger-950/40 dark:border-danger-800',
  cancelled: 'text-danger-600 bg-danger-50 border-danger-200 dark:bg-danger-950/40 dark:border-danger-800'
}

/** Solid status label pill — always white text on a solid semantic color. */
const labelColorMap: Record<string, string> = {
  approved: 'text-white bg-success-600',
  used: 'text-white bg-success-600',
  pending: 'text-white bg-warning-600',
  received: 'text-white bg-warning-600',
  review: 'text-white bg-primary-700',
  rejected: 'text-white bg-danger-600',
  cancelled: 'text-white bg-danger-600'
}

function formatDaysAgo(dateStr: string): string {
  if (!dateStr || dateStr === '—') return '—'
  const match = dateStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!match || !match[1] || !match[2] || !match[3]) return dateStr

  const appYear = parseInt(match[1], 10)
  const appMonth = parseInt(match[2], 10) - 1
  const appDay = parseInt(match[3], 10)

  const date = new Date(appYear, appMonth, appDay)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - date.getTime()
  const daysAgo = Math.floor(diffTime / (1000 * 3600 * 24))

  if (daysAgo === 0) return `${dateStr} (today)`
  if (daysAgo === 1) return `${dateStr} (1 day ago)`
  if (daysAgo > 1) return `${dateStr} (${daysAgo} days ago)`
  return dateStr
}

const cells = computed(() => {
  const r = props.result
  const appDate = r.applicationDate || '—'
  const entryDate = r.entryDate || '—'
  const purpose = r.entryPurpose || '—'

  const list: { label: string, value: string, copy?: boolean }[] = [
    { label: 'Passport', value: props.input.passport, copy: true },
    { label: 'Applied', value: formatDaysAgo(appDate) }
  ]
  if (entryDate !== '—' && entryDate !== '') list.push({ label: 'Issued Date', value: formatDaysAgo(entryDate) })
  if (r.statusOfResidence) list.push({ label: 'Residency Class', value: r.statusOfResidence })
  if (r.visaKind) list.push({ label: 'Visa Category', value: r.visaKind })
  if (r.visaExpiry) list.push({ label: 'Expiry Date', value: r.visaExpiry })
  if (r.invitingCompany) list.push({ label: 'Inviting Company', value: r.invitingCompany })
  if (purpose !== '—' && purpose !== '' && purpose !== r.statusOfResidence) list.push({ label: 'Purpose', value: purpose })
  list.push({ label: 'Visa Mode', value: props.visaType })
  return list
})

const showDownload = computed(() => {
  const statusUpper = (props.result.status || '').toUpperCase()
  const isApproved = statusUpper.includes('APPROVED') || statusUpper.includes('VISA USED') || statusUpper.includes('ISSUED')
  return isApproved && Boolean(props.result.pdfUrl)
})

const downloadUrl = computed(() =>
  downloadPdfUrl({
    passport: props.input.passport,
    name: props.input.name,
    dob: props.input.dob,
    visaType: props.visaType,
    appNo: props.input.appNo
  })
)

const isProcessingStatus = computed(() => {
  const statusUpper = (props.result.status || '').toUpperCase()
  const isFinal = (
    statusUpper.includes('APPROVED') ||
    statusUpper.includes('REJECTED') ||
    statusUpper.includes('CANCELLED') ||
    statusUpper.includes('EXPIRED') ||
    statusUpper.includes('USED') ||
    statusUpper.includes('RETURNED') ||
    statusUpper.includes('PASSED') ||
    statusUpper.includes('ISSUED')
  )
  if (isFinal) return false

  return (
    statusUpper.includes('RECEIVED') ||
    statusUpper.includes('REVIEW') ||
    statusUpper.includes('SUPPLEMENT') ||
    statusUpper.includes('PENDING') ||
    statusUpper.includes('접수') ||
    statusUpper.includes('심사중')
  )
})

const AVERAGE_VISA_DAYS = 19

const remainingDaysText = computed(() => {
  const appDateStr = props.result.applicationDate
  if (!appDateStr) {
    return `Result expected in approx. ${AVERAGE_VISA_DAYS} days`
  }

  const match = appDateStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!match) {
    return `Result expected in approx. ${AVERAGE_VISA_DAYS} days`
  }

  const appYear = parseInt(match[1], 10)
  const appMonth = parseInt(match[2], 10) - 1
  const appDay = parseInt(match[3], 10)

  const appDate = new Date(appYear, appMonth, appDay)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - appDate.getTime()
  const elapsedDays = Math.floor(diffTime / (1000 * 3600 * 24))

  const remaining = AVERAGE_VISA_DAYS - elapsedDays

  if (remaining > 1) {
    return `Result expected in approx. ${remaining} days`
  } else if (remaining === 1) {
    return 'Result expected in approx. 1 day'
  } else {
    return 'Result expected very soon'
  }
})
</script>

<template>
  <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)] overflow-hidden shadow-sm">
    <div class="px-6 pt-7 pb-5 text-center">
      <div
        class="flex items-center justify-center size-13 rounded-full mx-auto mb-3.5 border"
        :class="colorMap[statusConfig.cls]"
      >
        <UIcon
          :name="iconMap[statusConfig.icon]"
          class="size-6"
        />
      </div>
      <span
        class="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm mb-2"
        :class="labelColorMap[statusConfig.cls]"
      >
        {{ statusConfig.label }}
      </span>
      <p class="text-lg font-bold text-[var(--color-text-primary)] dark:text-white leading-snug break-words mt-1">
        {{ props.input.name }}
      </p>
    </div>

    <!-- Estimated processing days banner (Received, Under review, Supplement Needed) -->
    <div
      v-if="isProcessingStatus"
      class="mx-5 mb-5 p-4.5 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-sky-50/50 to-blue-50/80 dark:from-blue-950/60 dark:via-slate-900/60 dark:to-blue-950/40 border border-blue-200/90 dark:border-blue-800/60 shadow-xs relative overflow-hidden"
    >
      <!-- Background decorative accent icon -->
      <UIcon
        name="i-lucide-clock"
        class="size-24 text-blue-500/5 dark:text-blue-400/5 absolute -right-3 -bottom-3 pointer-events-none"
      />

      <div class="flex items-center justify-between gap-3 sm:gap-5 relative z-10">
        <!-- Left: Average Days -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <UIcon
              name="i-lucide-calendar-clock"
              class="size-3.5 shrink-0"
            />
            <span class="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider leading-none">
              AVG. PROCESSING TIME
            </span>
          </div>
          <p class="text-2xl sm:text-[28px] font-black text-blue-700 dark:text-blue-300 tracking-tight leading-none mt-2">
            ~{{ AVERAGE_VISA_DAYS }} Days
          </p>
        </div>

        <!-- Center Divider -->
        <div class="w-px h-11 bg-gradient-to-b from-blue-200/30 via-blue-300 dark:via-blue-700 to-blue-200/30 shrink-0" />

        <!-- Right: Status Forecast -->
        <div class="flex-1 min-w-0 text-right">
          <div class="flex items-center justify-end gap-1.5 text-blue-600 dark:text-blue-400">
            <UIcon
              name="i-lucide-hourglass"
              class="size-3.5 shrink-0 animate-pulse"
            />
            <span class="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider leading-none">
              PROCESSING STATUS
            </span>
          </div>
          <p class="text-[13px] sm:text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 mt-2 leading-snug">
            {{ remainingDaysText }}
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-px bg-[var(--color-border)] dark:bg-white/[0.08] border-t border-[var(--color-border)] dark:border-white/[0.08]">
      <div
        v-for="cell in cells"
        :key="cell.label"
        class="bg-white dark:bg-[var(--color-card-dark)] px-5 py-3.5 group/cell relative"
        :class="{ 'col-span-2': cells.length % 2 === 1 && cell === cells[cells.length - 1] }"
      >
        <p class="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
          {{ cell.label }}
        </p>
        <div class="flex items-center gap-1.5">
          <span class="text-[13.5px] font-semibold text-[var(--color-text-primary)] dark:text-white break-words">{{ cell.value }}</span>
          <button
            v-if="cell.copy"
            type="button"
            class="flex items-center justify-center size-5 rounded-md bg-neutral-100 dark:bg-white/10 text-[var(--color-text-secondary)] hover:text-primary-700 opacity-75 hover:opacity-100 transition-opacity"
            aria-label="Copy passport number"
            @click="copyValue(cell.value, 'result-passport')"
          >
            <UIcon
              :name="isCopied('result-passport') ? 'i-lucide-check' : 'i-lucide-clipboard'"
              class="size-3"
            />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="props.result.rejectionReason"
      class="px-5 py-3.5 bg-danger-50 dark:bg-danger-950/30 border-t border-danger-200 dark:border-danger-900 flex gap-2.5"
    >
      <UIcon
        name="i-lucide-circle-x"
        class="size-4 text-danger-600 shrink-0 mt-0.5"
      />
      <p class="text-[13.5px] text-danger-800 dark:text-danger-300 leading-relaxed">
        <strong>Reason:</strong> {{ props.result.rejectionReason }}
      </p>
    </div>

    <div
      v-if="props.cached"
      class="px-5 py-2.5 bg-warning-50 dark:bg-warning-950/30 border-t border-warning-200 dark:border-warning-900 flex items-center gap-1.5 text-[12.5px] font-medium text-warning-700 dark:text-warning-400"
    >
      <UIcon
        name="i-lucide-clock"
        class="size-3.5 shrink-0"
      />
      <span>Showing last known status{{ props.result.lastChecked ? ` from ${formatRelativeTime(props.result.lastChecked)}` : '' }}. Live lookup unavailable.</span>
    </div>

    <div
      v-if="showDownload"
      class="px-5 py-4 border-t border-[var(--color-border)] dark:border-white/[0.08]"
    >
      <UButton
        :to="downloadUrl"
        target="_blank"
        block
        color="primary"
        variant="solid"
        icon="i-lucide-download"
        class="bg-[#064e3b] hover:bg-[#043e2f] text-white font-semibold py-2.5 shadow-xs"
      >
        Download pdf
      </UButton>
    </div>
  </div>
</template>
