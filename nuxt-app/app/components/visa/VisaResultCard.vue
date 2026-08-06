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

const cells = computed(() => {
  const r = props.result
  const appDate = r.applicationDate || '—'
  const entryDate = r.entryDate || '—'
  const purpose = r.entryPurpose || '—'

  const list: { label: string, value: string, copy?: boolean }[] = [
    { label: 'Passport', value: props.input.passport, copy: true },
    { label: 'Applied', value: appDate }
  ]
  if (entryDate !== '—' && entryDate !== '') list.push({ label: 'Issued Date', value: entryDate })
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
  return Boolean(props.result.pdfUrl) || statusUpper === 'APPROVED' || statusUpper === 'VISA USED'
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
</script>

<template>
  <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)] overflow-hidden shadow-sm">
    <div class="px-6 pt-7 pb-5 text-center">
      <div
        class="flex items-center justify-center size-13 rounded-full mx-auto mb-3.5 border"
        :class="colorMap[statusConfig.cls]"
      >
        <UIcon :name="iconMap[statusConfig.icon]" class="size-6" />
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

    <div class="grid grid-cols-2 gap-px bg-[var(--color-border)] dark:bg-white/[0.08] border-t border-[var(--color-border)] dark:border-white/[0.08]">
      <div
        v-for="cell in cells"
        :key="cell.label"
        class="bg-white dark:bg-[var(--color-card-dark)] px-5 py-3.5 group/cell relative"
        :class="{ 'col-span-2': cells.length % 2 === 1 && cell === cells[cells.length - 1] }"
      >
        <p class="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">{{ cell.label }}</p>
        <div class="flex items-center gap-1.5">
          <span class="text-[13.5px] font-semibold text-[var(--color-text-primary)] dark:text-white break-words">{{ cell.value }}</span>
          <button
            v-if="cell.copy"
            type="button"
            class="flex items-center justify-center size-5 rounded-md bg-neutral-100 dark:bg-white/10 text-[var(--color-text-secondary)] hover:text-primary-700 opacity-75 hover:opacity-100 transition-opacity"
            aria-label="Copy passport number"
            @click="copyValue(cell.value, 'result-passport')"
          >
            <UIcon :name="isCopied('result-passport') ? 'i-lucide-check' : 'i-lucide-clipboard'" class="size-3" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="props.result.rejectionReason" class="px-5 py-3.5 bg-danger-50 dark:bg-danger-950/30 border-t border-danger-200 dark:border-danger-900 flex gap-2.5">
      <UIcon name="i-lucide-circle-x" class="size-4 text-danger-600 shrink-0 mt-0.5" />
      <p class="text-[13.5px] text-danger-800 dark:text-danger-300 leading-relaxed">
        <strong>Reason:</strong> {{ props.result.rejectionReason }}
      </p>
    </div>

    <div v-if="props.cached" class="px-5 py-2.5 bg-warning-50 dark:bg-warning-950/30 border-t border-warning-200 dark:border-warning-900 flex items-center gap-1.5 text-[12.5px] font-medium text-warning-700 dark:text-warning-400">
      <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
      <span>Showing last known status{{ props.result.lastChecked ? ` from ${formatRelativeTime(props.result.lastChecked)}` : '' }}. Live lookup unavailable.</span>
    </div>

    <div v-if="showDownload" class="px-5 py-4 border-t border-[var(--color-border)] dark:border-white/[0.08]">
      <UButton :to="downloadUrl" target="_blank" block color="neutral" variant="outline" icon="i-lucide-download">
        Download Certificate PDF
      </UButton>
    </div>
  </div>
</template>
