<script setup lang="ts">
import type { Admission } from './AdmissionDetailsModal.vue'

interface AdmissionsApiResponse {
  success: boolean
  data: Admission[]
  error?: string
}

const searchQuery = ref('')
const selectedLevel = ref('all')
const selectedStatus = ref('all')

const levelFilters = [
  { value: 'all', label: 'All programs' },
  { value: 'BACHELOR', label: 'Bachelor' },
  { value: 'MASTERS', label: 'Master' },
  { value: 'MASTER NO CERTIFICATE', label: 'Master (No Certificate)' },
  { value: 'COLLEGE', label: 'College' },
  { value: 'LANGUAGE COURSE', label: 'Language Course' }
]

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'ongoing', label: '🟢 Active' },
  { value: 'soon', label: '⏳ Soon' },
  { value: 'expected', label: '📅 Upcoming' },
  { value: 'outdated', label: '⚪ Closed' }
]

// Modal state
const detailsModalOpen = ref(false)
const selectedAdmission = ref<Admission | null>(null)

function openDetails(item: Admission) {
  selectedAdmission.value = item
  detailsModalOpen.value = true
}

// Fetch admissions from Turso admissions table via server API
const { data: response, pending } = await useFetch<AdmissionsApiResponse>('/api/admissions', {
  default: () => ({ success: true, data: [] })
})

const rawAdmissions = computed(() => response.value?.data || [])

const levelLabels: Record<string, { text: string, class: string }> = {
  'BACHELOR': { text: 'Bachelor', class: 'bg-blue-600 text-white font-bold border-blue-700' },
  'MASTERS': { text: 'Master', class: 'bg-purple-600 text-white font-bold border-purple-700' },
  'MASTER NO CERTIFICATE': { text: 'Master (No Cert)', class: 'bg-indigo-600 text-white font-bold border-indigo-700' },
  'COLLEGE': { text: 'College', class: 'bg-teal-600 text-white font-bold border-teal-700' },
  'LANGUAGE COURSE': { text: 'Language Course', class: 'bg-amber-500 text-white font-bold border-amber-600' }
}

function getLevelBadge(level?: string | null) {
  if (!level) return { text: 'Program', class: 'bg-blue-600 text-white font-bold border-blue-700' }
  const upper = level.toUpperCase()
  return levelLabels[upper] || { text: level, class: 'bg-blue-600 text-white font-bold border-blue-700' }
}

function formatUniType(type: string): string {
  const t = (type || '').toLowerCase()
  if (t.includes('1%')) return '1% University'
  if (t.includes('davlat') || t.includes('national') || t.includes('public')) return 'National University'
  if (t.includes('xususiy') || t.includes('private')) return 'Private University'
  return type
}

function getUniTypeBadge(type: string) {
  const t = (type || '').toLowerCase()
  if (t.includes('1%')) {
    return 'bg-primary-900 text-white font-bold'
  }
  if (t.includes('davlat') || t.includes('national') || t.includes('public')) {
    return 'bg-teal-800 text-white font-bold'
  }
  if (t.includes('xususiy') || t.includes('private')) {
    return 'bg-slate-700 text-white font-bold'
  }
  return 'bg-blue-800 text-white font-bold'
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

function getAdmissionStatus(item: Admission) {
  if (item.is_expected || item.rounds_count === 'EXPECTED') {
    let expTime = Infinity
    if (item.expected_date_range?.from) {
      const parsed = Date.parse(item.expected_date_range.from)
      if (!isNaN(parsed)) expTime = parsed
    }
    return {
      type: 'expected',
      priority: 4,
      label: 'Upcoming',
      badgeClass: 'bg-orange-500 text-white font-bold shadow-xs',
      dotClass: 'bg-white',
      sortTimestamp: expTime
    }
  }

  const rounds = item.rounds || []
  if (rounds.length === 0) {
    return {
      type: 'outdated',
      priority: 5,
      label: 'Closed',
      badgeClass: 'bg-slate-400 text-white font-bold shadow-xs',
      dotClass: 'bg-white',
      sortTimestamp: 0
    }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const nowMs = now.getTime()

  let activeEndMs = Infinity
  let soonStartMs = Infinity
  let daysSoon = Infinity
  let latestPastEndMs = -Infinity

  for (const r of rounds) {
    if (r.onlineApplicationFrom && r.onlineApplicationTo) {
      const start = new Date(r.onlineApplicationFrom)
      const end = new Date(r.onlineApplicationTo)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      const startMs = start.getTime()
      const endMs = end.getTime()

      if (nowMs >= startMs && nowMs <= endMs) {
        // Active round: find nearest closing deadline
        if (endMs < activeEndMs) activeEndMs = endMs
      } else if (nowMs < startMs) {
        // Upcoming round: find nearest opening start date
        if (startMs < soonStartMs) {
          soonStartMs = startMs
          const diff = Math.ceil((startMs - nowMs) / (1000 * 60 * 60 * 24))
          if (diff < daysSoon) daysSoon = diff
        }
      } else {
        // Past round: record latest end date
        if (endMs > latestPastEndMs) latestPastEndMs = endMs
      }
    }
  }

  // 1. Active admission (nearest closing deadline first)
  if (activeEndMs !== Infinity) {
    return {
      type: 'ongoing',
      priority: 1,
      label: 'Active',
      badgeClass: 'bg-emerald-700 text-white font-bold shadow-xs',
      dotClass: 'bg-white animate-pulse',
      sortTimestamp: activeEndMs
    }
  }

  // 2. After X days / Soon (nearest opening date first)
  if (soonStartMs !== Infinity) {
    return {
      type: 'soon',
      priority: 2,
      label: daysSoon === 1 ? '1 day left' : `${daysSoon} days left`,
      badgeClass: 'bg-amber-500 text-white font-bold shadow-xs',
      dotClass: 'bg-white',
      sortTimestamp: soonStartMs
    }
  }

  // 3. Closed
  return {
    type: 'outdated',
    priority: 5,
    label: 'Closed',
    badgeClass: 'bg-slate-400 text-white font-bold shadow-xs',
    dotClass: 'bg-white',
    sortTimestamp: latestPastEndMs !== -Infinity ? latestPastEndMs : 0
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ''
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
      const month = p1.padStart(2, '0')
      const day = (p0.length === 4 ? p2 : p0).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return dateStr
  } catch {
    return dateStr || ''
  }
}

function isNewAdmission(item?: Admission | null): boolean {
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

const processedAdmissions = computed(() => {
  const list = (rawAdmissions.value || []).filter(item => !item.is_hidden)
  return list.map((item) => {
    const statusInfo = getAdmissionStatus(item)
    return {
      ...item,
      statusInfo
    }
  })
})

const filteredAdmissions = computed(() => {
  let list = processedAdmissions.value
  const query = searchQuery.value.trim().toLowerCase()

  if (query) {
    list = list.filter((item) => {
      const uniName = (item.university_name || '').toLowerCase()
      const eduLevel = (item.education_level || '').toLowerCase()
      const levelText = (getLevelBadge(item.education_level).text || '').toLowerCase()
      const period = (item.admission_period || '').toLowerCase()
      const types = (item.university_types || []).map(formatUniType).join(' ').toLowerCase()
      return uniName.includes(query) || eduLevel.includes(query) || levelText.includes(query) || period.includes(query) || types.includes(query)
    })
  }

  if (selectedLevel.value !== 'all') {
    list = list.filter(item => (item.education_level || '').toUpperCase() === selectedLevel.value)
  }

  if (selectedStatus.value !== 'all') {
    list = list.filter(item => item.statusInfo.type === selectedStatus.value)
  }

  // Sort by priority then by nearest date
  return [...list].sort((a, b) => {
    // 1. Priority order: Ongoing (1) > Soon/After X days (2) > Upcoming (4) > Closed (5)
    if (a.statusInfo.priority !== b.statusInfo.priority) {
      return a.statusInfo.priority - b.statusInfo.priority
    }

    // 2. Nearest date ordering within each category:
    if (a.statusInfo.priority === 1 || a.statusInfo.priority === 2 || a.statusInfo.priority === 4) {
      if (a.statusInfo.sortTimestamp !== b.statusInfo.sortTimestamp) {
        return a.statusInfo.sortTimestamp - b.statusInfo.sortTimestamp
      }
    }

    // Closed (5): sort by most recently ended descending
    if (a.statusInfo.priority === 5) {
      if (a.statusInfo.sortTimestamp !== b.statusInfo.sortTimestamp) {
        return b.statusInfo.sortTimestamp - a.statusInfo.sortTimestamp
      }
    }

    // 3. Fallback alphabetical by university name
    return (a.university_name || '').localeCompare(b.university_name || '')
  })
})
</script>

<template>
  <section
    id="admission"
    class="max-w-7xl mx-auto px-3 sm:px-4 py-16 sm:py-20 scroll-mt-16 border-t border-[var(--color-border)] dark:border-white/[0.08]"
  >
    <!-- Section Header in Brand Luxury Theme -->
    <div class="text-center max-w-3xl mx-auto mb-10 space-y-2.5">
      <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-50 dark:bg-primary-950/50 border border-primary-200/80 dark:border-primary-800/50 text-primary-900 dark:text-secondary-300 text-xs font-bold uppercase tracking-wider shadow-xs">
        <UIcon
          name="i-lucide-graduation-cap"
          class="size-4 text-primary-700 dark:text-secondary-400"
        />
        <span>Official Admission Schedule</span>
      </div>

      <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
        Universitetlarga Qabul Sanalari (Admission)
      </h2>

      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
        Official admission deadlines, application rounds, and schedules for South Korean universities: Bachelor, Master, and Language courses.
      </p>
    </div>

    <!-- Corporate Search & Filter Toolbar -->
    <div class="rounded-3xl bg-white dark:bg-[var(--color-card-dark)] border border-slate-200/80 dark:border-white/[0.08] p-4 sm:p-5 mb-6 shadow-sm space-y-3.5">
      <div class="flex flex-col sm:flex-row items-center gap-3">
        <!-- Search -->
        <div class="w-full sm:flex-1">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search by university name or program (e.g. Korea, Bachelor)..."
            size="lg"
            class="w-full"
          />
        </div>

        <!-- Level Selector -->
        <div class="w-full sm:w-60">
          <USelect
            v-model="selectedLevel"
            :items="levelFilters"
            value-key="value"
            label-key="label"
            size="lg"
            class="w-full"
          />
        </div>
      </div>

      <!-- Status Filter Tabs & Results Count Row -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/[0.08]">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="st in statusFilters"
            :key="st.value"
            type="button"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border"
            :class="selectedStatus === st.value
              ? 'bg-primary-900 border-primary-900 text-white shadow-xs'
              : 'bg-slate-50 dark:bg-white/5 border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-neutral-300 hover:bg-primary-50 dark:hover:bg-white/10 hover:text-primary-900'"
            @click="selectedStatus = st.value"
          >
            {{ st.label }}
          </button>
        </div>

        <div class="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
          Showing: <span class="text-primary-900 dark:text-secondary-300">{{ filteredAdmissions.length }}</span> {{ filteredAdmissions.length === 1 ? 'admission' : 'admissions' }}
        </div>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div
      v-if="pending"
      class="rounded-3xl bg-white dark:bg-[var(--color-card-dark)] border border-slate-200/80 dark:border-white/[0.08] p-6 space-y-3"
    >
      <div
        v-for="i in 6"
        :key="i"
        class="h-14 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredAdmissions.length === 0"
      class="rounded-3xl bg-white dark:bg-[var(--color-card-dark)] border border-slate-200/80 dark:border-white/[0.08] p-12 text-center shadow-sm"
    >
      <UiEmptyState
        icon="i-lucide-search"
        title="No admissions found"
        description="Try adjusting your search query or selected filters."
      />
    </div>

    <!-- Executive Business Admissions Table -->
    <div
      v-else
      class="rounded-3xl bg-white dark:bg-[var(--color-card-dark)] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-sm"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-primary-50/80 dark:bg-white/[0.04] border-b border-slate-200/80 dark:border-white/[0.08]">
            <tr class="text-[11.5px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <th class="px-4 py-3.5 w-12 text-center">
                #
              </th>
              <th class="px-4 py-3.5 min-w-[280px]">
                University
              </th>
              <th class="px-4 py-3.5 min-w-[170px]">
                Program / Semester
              </th>
              <th class="px-4 py-3.5 min-w-[250px]">
                Admission Period
              </th>
              <th class="px-4 py-3.5 min-w-[140px] text-right">
                Status
              </th>
              <th class="px-4 py-3.5 w-24 text-center">
                Details
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/[0.06]">
            <tr
              v-for="(item, index) in filteredAdmissions"
              :key="item.id"
              class="cursor-pointer hover:bg-primary-50/40 dark:hover:bg-white/[0.02] transition-colors group"
              @click="openDetails(item)"
            >
              <!-- # -->
              <td class="px-4 py-4 text-center text-xs text-slate-400 font-bold">
                {{ index + 1 }}
              </td>

              <!-- University Name & Badges -->
              <td class="px-4 py-4">
                <div class="flex items-start gap-3">
                  <!-- University Icon -->
                  <div class="size-9 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-secondary-300 border border-primary-100 dark:border-primary-900/50 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <UIcon
                      name="i-lucide-building-2"
                      class="size-4.5"
                    />
                  </div>

                  <div class="space-y-1.5 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-[13.5px] text-slate-900 dark:text-white leading-snug uppercase tracking-tight group-hover:text-primary-800 dark:group-hover:text-secondary-300 transition-colors">
                        {{ item.university_name }}
                      </span>
                      <span
                        v-if="isNewAdmission(item)"
                        class="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase tracking-wider bg-rose-600 text-white shadow-2xs shrink-0"
                      >
                        NEW
                      </span>
                    </div>

                    <!-- Badges Row -->
                    <div
                      v-if="item.university_types && item.university_types.length > 0"
                      class="flex flex-wrap items-center gap-1"
                    >
                      <span
                        v-for="ut in item.university_types"
                        :key="ut"
                        class="px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-semibold"
                        :class="getUniTypeBadge(ut)"
                      >
                        {{ formatUniType(ut) }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Education Level & Admission Period -->
              <td class="px-4 py-4">
                <div class="flex flex-col items-start gap-1">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] uppercase tracking-wider"
                    :class="getLevelBadge(item.education_level).class"
                  >
                    {{ getLevelBadge(item.education_level).text }}
                  </span>
                  <span
                    v-if="item.admission_period"
                    class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-calendar"
                      class="size-3"
                    />
                    {{ item.admission_period }}
                  </span>
                </div>
              </td>

              <!-- Application Dates (Clean multi-round schedule) -->
              <td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
                <!-- Rounds with dates -->
                <div
                  v-if="item.rounds && item.rounds.length > 0"
                  class="space-y-1.5"
                >
                  <div
                    v-for="(round, rIdx) in item.rounds"
                    :key="rIdx"
                    class="flex items-center gap-1.5 flex-wrap"
                  >
                    <span
                      :class="getRoundBadgeClass(round.roundNumber || (rIdx + 1))"
                      class="px-2 py-0.5 rounded-full font-bold text-[10.5px] tracking-wide shrink-0 shadow-2xs"
                    >
                      R{{ round.roundNumber || (rIdx + 1) }}
                    </span>
                    <span
                      v-if="round.onlineApplicationFrom && round.onlineApplicationTo"
                      class="font-semibold text-slate-900 dark:text-white text-[13px]" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;"
                    >
                      {{ formatDate(round.onlineApplicationFrom) }} — {{ formatDate(round.onlineApplicationTo) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 italic"
                    >
                      No dates specified
                    </span>
                  </div>
                </div>

                <!-- Expected with date range -->
                <div
                  v-else-if="item.is_expected || item.rounds_count === 'EXPECTED'"
                  class="space-y-0.5"
                >
                  <div
                    v-if="item.expected_date_range?.from || item.expected_date_range?.to"
                    class="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 text-[13px]" style="font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums;"
                  >
                    <UIcon
                      name="i-lucide-clock"
                      class="size-3.5 shrink-0"
                    />
                    {{ formatDate(item.expected_date_range.from) }} — {{ formatDate(item.expected_date_range.to) }}
                  </div>
                  <div
                    v-else
                    class="text-[11px] text-amber-600 dark:text-amber-400 italic"
                  >
                    Dates to be announced soon
                  </div>
                </div>

                <!-- Fallback when no dates -->
                <div
                  v-else
                  class="text-[11px] text-slate-400 italic"
                >
                  No dates available
                </div>
              </td>

              <!-- Status Badge -->
              <td class="px-4 py-4 text-right">
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  :class="item.statusInfo.badgeClass"
                >
                  {{ item.statusInfo.label }}
                </span>
              </td>

              <!-- Action Button -->
              <td class="px-4 py-4 text-center">
                <button
                  type="button"
                  class="inline-flex items-center justify-center size-8 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 group-hover:bg-primary-900 group-hover:text-white transition-all cursor-pointer shadow-2xs"
                  title="View details"
                  aria-label="View details"
                  @click.stop="openDetails(item)"
                >
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-4"
                  />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Admission Details Modal -->
    <UniversityAdmissionDetailsModal
      v-model:open="detailsModalOpen"
      :admission="selectedAdmission"
    />
  </section>
</template>
