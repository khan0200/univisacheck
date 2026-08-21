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
    documentSubmission?: string
    interview?: string
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
  'BACHELOR': { text: 'BACHELOR', class: 'bg-primary-900 text-white' },
  'MASTERS': { text: 'MASTER', class: 'bg-purple-700 text-white' },
  'MASTER NO CERTIFICATE': { text: 'MASTER (NO CERT)', class: 'bg-indigo-700 text-white' },
  'COLLEGE': { text: 'COLLEGE', class: 'bg-teal-700 text-white' },
  'LANGUAGE COURSE': { text: 'LANGUAGE COURSE', class: 'bg-amber-600 text-white' }
}

function getEducationLevelInfo(lvl?: string | null) {
  if (!lvl) return { text: 'BACHELOR', class: 'bg-primary-900 text-white' }
  const upper = lvl.toUpperCase()
  return levelLabels[upper] || { text: upper, class: 'bg-primary-900 text-white' }
}

function formatUniType(type: string): string {
  const t = (type || '').toLowerCase()
  if (t.includes('1%')) return '1% University'
  if (t.includes('davlat') || t.includes('national') || t.includes('public')) return 'National University'
  if (t.includes('xususiy') || t.includes('private')) return 'Private University'
  return type
}

function getRoundBadgeClass(roundNum: number | string) {
  const num = typeof roundNum === 'number' ? roundNum : parseInt(String(roundNum), 10) || 1
  switch (num) {
    case 1:
      return 'bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60'
    case 2:
      return 'bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60'
    case 3:
      return 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60'
    case 4:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60'
    default:
      return 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60'
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
</script>

<template>
  <UModal
    :open="props.open"
    title="Admission Schedule & Details"
    :ui="{ content: 'sm:max-w-2xl rounded-3xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="props.admission"
        class="space-y-4"
      >
        <!-- Compact Header: University & Badges in One Clean Row -->
        <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/[0.08]">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="size-9 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-800 dark:text-secondary-300 border border-primary-100 dark:border-primary-900/50 flex items-center justify-center shrink-0">
              <UIcon
                name="i-lucide-building-2"
                class="size-4.5"
              />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase truncate">
                  {{ props.admission.university_name }}
                </h3>
                <span
                  v-if="isNewAdmission(props.admission)"
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase tracking-wider bg-rose-600 text-white shadow-2xs shrink-0"
                >
                  NEW
                </span>
              </div>
              <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                  :class="getEducationLevelInfo(props.admission.education_level).class"
                >
                  {{ getEducationLevelInfo(props.admission.education_level).text }}
                </span>
                <span
                  v-if="props.admission.admission_period"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 uppercase"
                >
                  {{ props.admission.admission_period }}
                </span>
                <span
                  v-for="ut in (props.admission.university_types || [])"
                  :key="ut"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-50 dark:bg-primary-950/40 text-primary-800 dark:text-secondary-300 border border-primary-200/60 dark:border-primary-800/40 uppercase"
                >
                  {{ formatUniType(ut) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- MAIN FOCUS: Dates Schedule Section -->
        <div>
          <!-- Expected State Banner -->
          <div
            v-if="props.admission.is_expected || props.admission.rounds_count === 'EXPECTED'"
            class="p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 text-center space-y-2"
          >
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-xs font-bold uppercase tracking-wider">
              <UIcon
                name="i-lucide-clock"
                class="size-3.5"
              />
              Admission Expected
            </div>
            <div class="text-sm sm:text-base font-bold text-amber-950 dark:text-amber-100">
              Expected period:
              <span
                v-if="props.admission.expected_date_range?.from || props.admission.expected_date_range?.to"
                style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;"
              >
                {{ formatDate(props.admission.expected_date_range?.from) }} — {{ formatDate(props.admission.expected_date_range?.to) }}
              </span>
              <span v-else>Dates to be announced soon</span>
            </div>
            <p class="text-xs text-amber-800 dark:text-amber-300">
              Will be updated once officially confirmed by the university.
            </p>
          </div>

          <!-- Exact Rounds Dates Display -->
          <div
            v-else-if="props.admission.rounds && props.admission.rounds.length > 0"
            class="space-y-3"
          >
            <div
              v-for="(round, idx) in props.admission.rounds"
              :key="idx"
              class="rounded-2xl border border-slate-200 dark:border-white/[0.08] border-l-4 border-l-primary-900 p-4 bg-slate-50/60 dark:bg-white/[0.02] space-y-3 shadow-2xs"
            >
              <!-- Round Header Badge -->
              <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-white/[0.06]">
                <div class="flex items-center gap-2">
                  <span
                    :class="getRoundBadgeClass(round.roundNumber || (idx + 1))"
                    class="px-2.5 py-0.5 rounded-full font-bold text-xs shadow-2xs"
                  >
                    R{{ round.roundNumber || (idx + 1) }}
                  </span>
                  <span class="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    Admission Dates
                  </span>
                </div>
              </div>

              <!-- 4 Step Date Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <!-- 1. Online Application -->
                <div class="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] space-y-1">
                  <div class="flex items-center gap-1.5 text-[10.5px] font-bold text-primary-900 dark:text-secondary-300 uppercase tracking-wider">
                    <UIcon
                      name="i-lucide-calendar"
                      class="size-3.5"
                    />
                    Online Application
                  </div>
                  <div class="font-bold text-slate-900 dark:text-white text-xs" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;">
                    <span v-if="round.onlineApplicationFrom && round.onlineApplicationTo">
                      {{ formatDate(round.onlineApplicationFrom) }} — {{ formatDate(round.onlineApplicationTo) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 font-normal italic font-sans"
                    >
                      Not specified
                    </span>
                  </div>
                </div>

                <!-- 2. Document Submission -->
                <div class="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] space-y-1">
                  <div class="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    <UIcon
                      name="i-lucide-file-text"
                      class="size-3.5"
                    />
                    Document Submission
                  </div>
                  <div class="font-bold text-slate-900 dark:text-white text-xs" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;">
                    <span v-if="round.documentSubmission">
                      {{ formatDate(round.documentSubmission) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 font-normal italic font-sans"
                    >
                      Not specified
                    </span>
                  </div>
                </div>

                <!-- 3. Interview -->
                <div class="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] space-y-1">
                  <div class="flex items-center gap-1.5 text-[10.5px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                    <UIcon
                      name="i-lucide-message-square"
                      class="size-3.5"
                    />
                    Interview Date
                  </div>
                  <div class="font-bold text-slate-900 dark:text-white text-xs" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;">
                    <span v-if="round.interview">
                      {{ formatDate(round.interview) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 font-normal italic font-sans"
                    >
                      Not specified
                    </span>
                  </div>
                </div>

                <!-- 4. Announcement / Result -->
                <div class="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] space-y-1">
                  <div class="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    <UIcon
                      name="i-lucide-bell"
                      class="size-3.5"
                    />
                    Announcement (Result)
                  </div>
                  <div class="font-bold text-slate-900 dark:text-white text-xs" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;">
                    <span v-if="round.announcement">
                      {{ formatDate(round.announcement) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 font-normal italic font-sans"
                    >
                      Not specified
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Fallback when no dates -->
          <div
            v-else
            class="p-6 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 dark:border-white/[0.1] rounded-2xl"
          >
            Application dates not specified
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-end">
        <button
          type="button"
          class="px-5 py-2 rounded-xl font-bold bg-primary-900 hover:bg-primary-800 text-white text-xs shadow-xs transition-all cursor-pointer"
          @click="emit('update:open', false)"
        >
          Close
        </button>
      </div>
    </template>
  </UModal>
</template>
