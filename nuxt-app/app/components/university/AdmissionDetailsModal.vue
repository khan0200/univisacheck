<script setup lang="ts">
export interface Admission {
  id: string
  university_name: string
  education_level: string
  admission_period: string | null
  rounds_count: string | null
  is_expected: boolean | null
  expected_date_range: { from?: string | null, to?: string | null } | null
  rounds: Array<{
    roundNumber?: number
    onlineApplicationFrom?: string
    onlineApplicationTo?: string
    documentSubmissionFrom?: string
    documentSubmissionTo?: string
    documentSubmission?: string
    interview?: string
    interviewFrom?: string
    interviewTo?: string
    announcementFrom?: string
    announcementTo?: string
    announcement?: string
  }> | null
  visa_types: string[] | null
  university_types: string[] | null
  is_hidden: boolean | null
  created_at: string
  updated_at: string
}

export type SupabaseAdmission = Admission

const props = defineProps<{
  open: boolean
  admission: SupabaseAdmission | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const levelLabels: Record<string, { text: string, class: string }> = {
  'BACHELOR': { text: 'Bachelor', class: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200 border border-slate-200/60 dark:border-white/10' },
  'MASTERS': { text: 'Master', class: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20' },
  'MASTER NO CERTIFICATE': { text: 'Master (No Cert)', class: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20' },
  'COLLEGE': { text: 'College', class: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20' },
  'LANGUAGE COURSE': { text: 'Language Course', class: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20' }
}

function getEducationLevelInfo(lvl?: string | null) {
  if (!lvl) return { text: 'Bachelor', class: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200 border border-slate-200/60 dark:border-white/10' }
  const upper = lvl.toUpperCase()
  return levelLabels[upper] || { text: upper, class: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200 border border-slate-200/60 dark:border-white/10' }
}

function formatUniType(type: string): string {
  const t = (type || '').toLowerCase()
  if (t.includes('1%')) return '1% Certified'
  if (t.includes('davlat') || t.includes('national') || t.includes('public')) return 'National'
  if (t.includes('xususiy') || t.includes('private')) return 'Private'
  return type
}

function getRoundBadgeClass(roundNum: number | string) {
  const num = typeof roundNum === 'number' ? roundNum : parseInt(String(roundNum), 10) || 1
  switch (num) {
    case 1:
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
    case 2:
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20'
    case 3:
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
    case 4:
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
    default:
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
  }
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.slice(0, 10)
      }
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const parts = dateStr.split(/[-/.]/)
    const p0 = parts[0] || ''
    const p1 = parts[1] || ''
    const p2 = parts[2] || ''
    if (p0 && p1 && p2) {
      const year = p0.length === 4 ? p0 : p2
      const month = String(p1).padStart(2, '0')
      const day = String(p0.length === 4 ? p2 : p0).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return dateStr
  } catch {
    return dateStr
  }
}

function getDateRangeInfo(from?: string, to?: string, legacy?: string) {
  const f = from?.trim() || ''
  const t = to?.trim() || ''
  if (f && t && f !== t) return { isRange: true, from: f, to: t, singleDate: '', hasValue: true }
  if (f && t && f === t) return { isRange: false, from: f, to: t, singleDate: f, hasValue: true }
  if (f) return { isRange: false, from: f, to: '', singleDate: f, hasValue: true }
  if (t) return { isRange: false, from: '', to: t, singleDate: t, hasValue: true }
  // Fallback to legacy string
  const raw = legacy?.trim() || ''
  if (!raw) return { isRange: false, from: '', to: '', singleDate: '', hasValue: false }
  if (raw.includes('~')) {
    const parts = raw.split('~').map(s => s.trim())
    if (parts[0] && parts[1] && parts[0] !== parts[1]) return { isRange: true, from: parts[0], to: parts[1], singleDate: '', hasValue: true }
    return { isRange: false, from: parts[0] || '', to: '', singleDate: parts[0] || parts[1] || '', hasValue: true }
  }
  return { isRange: false, from: raw, to: '', singleDate: raw, hasValue: true }
}

function getInterviewInfo(round?: {
  interview?: string
  interviewFrom?: string
  interviewTo?: string
} | null) {
  if (!round) return { isRange: false, from: '', to: '', singleDate: '', hasValue: false }

  const from = round.interviewFrom?.trim() || ''
  const to = round.interviewTo?.trim() || ''

  if (from && to && from !== to) {
    return { isRange: true, from, to, singleDate: '', hasValue: true }
  }
  if (from && to && from === to) {
    return { isRange: false, from, to, singleDate: from, hasValue: true }
  }
  if (from) {
    return { isRange: false, from, to: '', singleDate: from, hasValue: true }
  }
  if (to) {
    return { isRange: false, from: '', to, singleDate: to, hasValue: true }
  }

  // Fallback to legacy `interview` string field
  const raw = round.interview?.trim() || ''
  if (!raw) {
    return { isRange: false, from: '', to: '', singleDate: '', hasValue: false }
  }

  if (raw.includes('~')) {
    const parts = raw.split('~').map(s => s.trim())
    if (parts[0] && parts[1] && parts[0] !== parts[1]) {
      return { isRange: true, from: parts[0], to: parts[1], singleDate: '', hasValue: true }
    }
    return { isRange: false, from: parts[0] || '', to: '', singleDate: parts[0] || parts[1] || '', hasValue: true }
  }

  return { isRange: false, from: raw, to: '', singleDate: raw, hasValue: true }
}

function isNewAdmission(item?: SupabaseAdmission | null): boolean {
  if (!item) return false
  try {
    const createdMs = item.created_at ? new Date(item.created_at).getTime() : 0
    const updatedMs = item.updated_at ? new Date(item.updated_at).getTime() : 0
    const latestMs = Math.max(
      isNaN(createdMs) ? 0 : createdMs,
      isNaN(updatedMs) ? 0 : updatedMs
    )
    if (!latestMs) return false
    const nowMs = Date.now()
    const diffDays = (nowMs - latestMs) / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= 3
  } catch {
    return false
  }
}

interface RoundStatus {
  state: 'active' | 'upcoming' | 'ended' | 'unknown'
  label: string
  subtext?: string
  badgeClass: string
  dotClass?: string
  isActive: boolean
}

function getRoundStatus(round: {
  onlineApplicationFrom?: string
  onlineApplicationTo?: string
}): RoundStatus {
  if (!round.onlineApplicationFrom || !round.onlineApplicationTo) {
    return {
      state: 'unknown',
      label: 'TBA',
      badgeClass: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border border-slate-200/50 dark:border-white/5',
      isActive: false
    }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const nowMs = now.getTime()

  const start = new Date(round.onlineApplicationFrom)
  const end = new Date(round.onlineApplicationTo)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const startMs = start.getTime()
  const endMs = end.getTime()

  if (isNaN(startMs) || isNaN(endMs)) {
    return {
      state: 'unknown',
      label: 'TBA',
      badgeClass: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border border-slate-200/50 dark:border-white/5',
      isActive: false
    }
  }

  if (nowMs >= startMs && nowMs <= endMs) {
    const diffDays = Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24))
    const subtext = diffDays === 0 ? 'Last day' : `${diffDays}d left`
    return {
      state: 'active',
      label: 'Active',
      subtext,
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
      dotClass: 'bg-emerald-500',
      isActive: true
    }
  }

  if (nowMs < startMs) {
    const diffDays = Math.ceil((startMs - nowMs) / (1000 * 60 * 60 * 24))
    const subtext = diffDays === 1 ? 'Tomorrow' : `In ${diffDays}d`
    return {
      state: 'upcoming',
      label: 'Upcoming',
      subtext,
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
      dotClass: 'bg-amber-500',
      isActive: false
    }
  }

  return {
    state: 'ended',
    label: 'Closed',
    badgeClass: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border border-slate-200/50 dark:border-white/5',
    dotClass: 'bg-slate-400',
    isActive: false
  }
}

const overallStatus = computed(() => {
  if (!props.admission) return null
  if (props.admission.is_expected || props.admission.rounds_count === 'EXPECTED') {
    return {
      label: 'Upcoming',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
      dotClass: 'bg-amber-500'
    }
  }
  const rounds = props.admission.rounds || []
  if (!rounds.length) {
    return {
      label: 'Closed',
      badgeClass: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border border-slate-200/50 dark:border-white/5',
      dotClass: 'bg-slate-400'
    }
  }
  const hasActive = rounds.some(r => getRoundStatus(r).state === 'active')
  if (hasActive) {
    return {
      label: 'Active',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
      dotClass: 'bg-emerald-500 animate-pulse'
    }
  }
  const hasUpcoming = rounds.some(r => getRoundStatus(r).state === 'upcoming')
  if (hasUpcoming) {
    return {
      label: 'Opening Soon',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
      dotClass: 'bg-amber-500'
    }
  }
  return {
    label: 'Closed',
    badgeClass: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border border-slate-200/50 dark:border-white/5',
    dotClass: 'bg-slate-400'
  }
})
</script>

<template>
  <UModal
    :open="props.open"
    title="Admission Details"
    :ui="{ content: 'sm:max-w-3xl lg:max-w-4xl rounded-3xl max-h-[90vh] flex flex-col overflow-hidden bg-[#FBFBFC] dark:bg-[#121316]' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="props.admission"
        class="space-y-4 sm:space-y-5"
      >
        <!-- iOS Style Minimalist Header -->
        <div class="rounded-2xl bg-white dark:bg-white/[0.03] p-4 sm:p-5 border border-slate-200/70 dark:border-white/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <!-- Minimalist App Icon -->
              <div class="size-10 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <UIcon
                  name="i-lucide-building-2"
                  class="size-5"
                />
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight leading-snug">
                    {{ props.admission.university_name }}
                  </h3>
                  <span
                    v-if="isNewAdmission(props.admission)"
                    class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500 text-white"
                  >
                    New
                  </span>
                </div>

                <!-- Secondary Subhead: Term & Academic Level -->
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span class="font-medium text-slate-700 dark:text-slate-300">
                    {{ props.admission.admission_period || 'Period TBA' }}
                  </span>
                  <span class="text-slate-300 dark:text-white/20">·</span>
                  <span>{{ getEducationLevelInfo(props.admission.education_level).text }}</span>
                  <span class="text-slate-300 dark:text-white/20">·</span>
                  <span>{{ props.admission.rounds?.length || 0 }} {{ (props.admission.rounds?.length || 0) === 1 ? 'Round' : 'Rounds' }}</span>
                </p>
              </div>
            </div>

            <!-- iOS Soft Pill Status -->
            <div
              v-if="overallStatus"
              class="shrink-0"
            >
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                :class="overallStatus.badgeClass"
              >
                <span
                  v-if="overallStatus.dotClass"
                  class="size-1.5 rounded-full"
                  :class="overallStatus.dotClass"
                />
                {{ overallStatus.label }}
              </span>
            </div>
          </div>

          <!-- Minimalist Metadata Pills Row -->
          <div
            v-if="(props.admission.university_types?.length || 0) > 0 || (props.admission.visa_types?.length || 0) > 0"
            class="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100 dark:border-white/[0.05]"
          >
            <span
              v-for="ut in (props.admission.university_types || [])"
              :key="ut"
              class="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-white/5"
            >
              {{ formatUniType(ut) }}
            </span>

            <span
              v-for="vt in (props.admission.visa_types || [])"
              :key="vt"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-white/5"
            >
              <UIcon
                name="i-lucide-shield-check"
                class="size-3 text-emerald-600 dark:text-emerald-400"
              />
              {{ vt }}
            </span>
          </div>
        </div>

        <!-- Section Label -->
        <div class="flex items-center justify-between px-1">
          <span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Admission Schedule
          </span>
          <span class="text-[11px] text-slate-400 dark:text-slate-500">
            Korean Standard Time (KST)
          </span>
        </div>

        <!-- Expected Banner -->
        <div
          v-if="props.admission.is_expected || props.admission.rounds_count === 'EXPECTED'"
          class="p-5 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.08] text-center space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
        >
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-semibold">
            <span class="size-1.5 rounded-full bg-amber-500" />
            Official Schedule Expected
          </div>
          <div class="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
            <span v-if="props.admission.expected_date_range?.from || props.admission.expected_date_range?.to">
              {{ formatDate(props.admission.expected_date_range?.from) }} — {{ formatDate(props.admission.expected_date_range?.to) }}
            </span>
            <span
              v-else
              class="text-slate-400 font-normal italic text-xs"
            >
              Dates will be announced upon university release
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Preliminary estimated window. Confirmed guidelines will be updated once published by the university.
          </p>
        </div>

        <!-- SCHEDULE CONTAINER (RESPONSIVE: Desktop Table + Mobile iOS Inset Cards) -->
        <div v-else-if="props.admission.rounds && props.admission.rounds.length > 0">
          <!-- 1. DESKTOP / TABLET VIEW: Minimalist Business Table (>= md) -->
          <div class="hidden md:block rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-slate-50/75 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <tr class="text-[11px] font-medium text-slate-400 dark:text-slate-400">
                  <th class="px-4 py-3 font-semibold">
                    Round
                  </th>
                  <th class="px-4 py-3 font-semibold">
                    Online Application
                  </th>
                  <th class="px-4 py-3 font-semibold">
                    Document Deadline
                  </th>
                  <th class="px-4 py-3 font-semibold text-center">
                    Interview
                  </th>
                  <th class="px-4 py-3 font-semibold text-right">
                    Announcement
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/[0.04]">
                <tr
                  v-for="(round, idx) in props.admission.rounds"
                  :key="idx"
                  class="transition-colors"
                  :class="[
                    getRoundStatus(round).isActive
                      ? 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]'
                      : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.01]',
                    getRoundStatus(round).state === 'ended' ? 'opacity-60' : ''
                  ]"
                >
                  <!-- Round -->
                  <td class="px-4 py-3.5 align-middle whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <span
                        :class="getRoundBadgeClass(round.roundNumber || (idx + 1))"
                        class="px-2 py-0.5 rounded-md font-semibold text-[11px] shrink-0"
                      >
                        R{{ round.roundNumber || (idx + 1) }}
                      </span>
                      <span class="font-medium text-slate-900 dark:text-white text-xs">
                        Round {{ round.roundNumber || (idx + 1) }}
                      </span>
                    </div>
                  </td>

                  <!-- Online Application -->
                  <td class="px-4 py-3 align-middle whitespace-nowrap">
                    <div
                      v-if="round.onlineApplicationFrom && round.onlineApplicationTo"
                      class="font-mono text-xs tabular-nums leading-tight space-y-0.5"
                      :class="getRoundStatus(round).isActive ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-700 dark:text-slate-300'"
                    >
                      <div>{{ formatDate(round.onlineApplicationFrom) }}</div>
                      <div>{{ formatDate(round.onlineApplicationTo) }}</div>
                    </div>
                    <div
                      v-else-if="round.onlineApplicationFrom || round.onlineApplicationTo"
                      class="font-mono text-xs tabular-nums"
                    >
                      {{ formatDate(round.onlineApplicationFrom || round.onlineApplicationTo) }}
                    </div>
                    <span
                      v-else
                      class="text-slate-400 text-xs italic"
                    >
                      —
                    </span>
                  </td>

                  <!-- Document Deadline -->
                  <td class="px-4 py-3 align-middle whitespace-nowrap">
                    <div
                      v-if="getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).isRange"
                      class="font-mono text-xs tabular-nums leading-tight space-y-0.5 text-slate-700 dark:text-slate-300"
                    >
                      <div>{{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).from) }}</div>
                      <div>{{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).to) }}</div>
                    </div>
                    <div
                      v-else-if="getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).hasValue"
                      class="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300"
                    >
                      {{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).singleDate) }}
                    </div>
                    <span v-else class="text-slate-400 text-xs italic">—</span>
                  </td>

                  <!-- Interview -->
                  <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap">
                    <div
                      v-if="getInterviewInfo(round).isRange"
                      class="font-mono text-xs tabular-nums leading-tight space-y-0.5 text-slate-700 dark:text-slate-300"
                    >
                      <div>{{ formatDate(getInterviewInfo(round).from) }}</div>
                      <div>{{ formatDate(getInterviewInfo(round).to) }}</div>
                    </div>
                    <div
                      v-else-if="getInterviewInfo(round).hasValue"
                      class="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300"
                    >
                      {{ formatDate(getInterviewInfo(round).singleDate) }}
                    </div>
                    <span
                      v-else
                      class="text-slate-400 text-xs italic"
                    >
                      None
                    </span>
                  </td>

                  <!-- Announcement -->
                  <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div
                      v-if="getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).isRange"
                      class="font-mono text-xs tabular-nums leading-tight space-y-0.5 text-slate-700 dark:text-slate-300"
                    >
                      <div>{{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).from) }}</div>
                      <div>{{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).to) }}</div>
                    </div>
                    <div
                      v-else-if="getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).hasValue"
                      class="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 text-right"
                    >
                      {{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).singleDate) }}
                    </div>
                    <span v-else class="text-slate-400 text-xs italic">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 2. MOBILE VIEW: iOS Inset Grouped Cards (< md) -->
          <div class="md:hidden space-y-3">
            <div
              v-for="(round, idx) in props.admission.rounds"
              :key="idx"
              class="rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.08] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
              :class="[
                getRoundStatus(round).isActive ? 'ring-1 ring-emerald-500/30 dark:ring-emerald-500/20' : '',
                getRoundStatus(round).state === 'ended' ? 'opacity-70' : ''
              ]"
            >
              <!-- Card Header -->
              <div class="px-4 py-3 bg-slate-50/75 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.04] flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span
                    :class="getRoundBadgeClass(round.roundNumber || (idx + 1))"
                    class="px-2 py-0.5 rounded-md font-semibold text-[10.5px]"
                  >
                    R{{ round.roundNumber || (idx + 1) }}
                  </span>
                  <span class="font-semibold text-xs text-slate-900 dark:text-white">
                    Round {{ round.roundNumber || (idx + 1) }}
                  </span>
                </div>
              </div>

              <!-- iOS List Rows -->
              <div class="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs px-4">
                <!-- Online Application -->
                <div class="py-2.5 flex items-center justify-between gap-2">
                  <span class="text-slate-500 dark:text-slate-400 font-medium">Online Application</span>
                  <div
                    v-if="round.onlineApplicationFrom && round.onlineApplicationTo"
                    class="font-mono tabular-nums text-right text-xs leading-tight space-y-0.5"
                    :class="getRoundStatus(round).isActive ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-700 dark:text-slate-300'"
                  >
                    <div>{{ formatDate(round.onlineApplicationFrom) }}</div>
                    <div>{{ formatDate(round.onlineApplicationTo) }}</div>
                  </div>
                  <div
                    v-else-if="round.onlineApplicationFrom || round.onlineApplicationTo"
                    class="font-mono tabular-nums text-right text-xs"
                  >
                    {{ formatDate(round.onlineApplicationFrom || round.onlineApplicationTo) }}
                  </div>
                  <span
                    v-else
                    class="text-slate-400 text-xs italic"
                  >
                    —
                  </span>
                </div>

                <!-- Document Submission -->
                <div class="py-2.5 flex items-center justify-between gap-2">
                  <span class="text-slate-500 dark:text-slate-400 font-medium">Document Deadline</span>
                  <div
                    v-if="getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).isRange"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right leading-tight space-y-0.5"
                  >
                    <div>{{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).from) }}</div>
                    <div>{{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).to) }}</div>
                  </div>
                  <span
                    v-else-if="getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).hasValue"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right"
                  >
                    {{ formatDate(getDateRangeInfo(round.documentSubmissionFrom, round.documentSubmissionTo, round.documentSubmission).singleDate) }}
                  </span>
                  <span v-else class="text-slate-400 italic">—</span>
                </div>

                <!-- Interview -->
                <div class="py-2.5 flex items-center justify-between gap-2">
                  <span class="text-slate-500 dark:text-slate-400 font-medium">Interview / Exam</span>
                  <div
                    v-if="getInterviewInfo(round).isRange"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right leading-tight space-y-0.5"
                  >
                    <div>{{ formatDate(getInterviewInfo(round).from) }}</div>
                    <div>{{ formatDate(getInterviewInfo(round).to) }}</div>
                  </div>
                  <span
                    v-else-if="getInterviewInfo(round).hasValue"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right"
                  >
                    {{ formatDate(getInterviewInfo(round).singleDate) }}
                  </span>
                  <span
                    v-else
                    class="font-mono tabular-nums text-slate-400 text-right italic"
                  >
                    None
                  </span>
                </div>

                <!-- Announcement -->
                <div class="py-2.5 flex items-center justify-between gap-2">
                  <span class="text-slate-500 dark:text-slate-400 font-medium">Announcement</span>
                  <div
                    v-if="getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).isRange"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right leading-tight space-y-0.5"
                  >
                    <div>{{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).from) }}</div>
                    <div>{{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).to) }}</div>
                  </div>
                  <span
                    v-else-if="getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).hasValue"
                    class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-right"
                  >
                    {{ formatDate(getDateRangeInfo(round.announcementFrom, round.announcementTo, round.announcement).singleDate) }}
                  </span>
                  <span v-else class="text-slate-400 italic">—</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Fallback Empty State -->
        <div
          v-else
          class="p-6 text-center text-xs text-slate-400 dark:text-slate-500 italic rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/5"
        >
          No schedule dates published yet.
        </div>

        <!-- Minimalist iOS Callout Note -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/[0.06] flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
          <UIcon
            name="i-lucide-info"
            class="size-4 text-slate-400 shrink-0 mt-0.5"
          />
          <p class="leading-relaxed">
            All applications must be submitted online before 18:00 KST on the closing date. Official hardcopy documents must arrive at the admissions office prior to the document deadline.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-between">
        <span class="text-[11px] text-slate-400 dark:text-slate-500">
          SalomKorea
        </span>
        <button
          type="button"
          class="px-4 py-1.5 rounded-xl font-medium text-xs bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          @click="emit('update:open', false)"
        >
          Done
        </button>
      </div>
    </template>
  </UModal>
</template>
