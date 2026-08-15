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
  { value: 'all', label: 'Barcha dasturlar' },
  { value: 'BACHELOR', label: 'Bakalavr' },
  { value: 'MASTERS', label: 'Magistratura' },
  { value: 'MASTER NO CERTIFICATE', label: 'Sertifikatsiz Magistr' },
  { value: 'COLLEGE', label: 'Kollej' },
  { value: 'LANGUAGE COURSE', label: 'Til kursi' }
]

const statusFilters = [
  { value: 'all', label: 'Barchasi' },
  { value: 'ongoing', label: '🟢 Faol qabul' },
  { value: 'soon', label: '⏳ Tez kunda' },
  { value: 'expected', label: '📅 Kutilmoqda' },
  { value: 'outdated', label: '⚪ Tugagan' }
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
  'BACHELOR': { text: 'Bakalavr', class: 'bg-primary-900 text-white font-bold border-primary-800' },
  'MASTERS': { text: 'Magistratura', class: 'bg-purple-700 text-white font-bold border-purple-800' },
  'MASTER NO CERTIFICATE': { text: 'Magistr (Sertifikatsiz)', class: 'bg-indigo-700 text-white font-bold border-indigo-800' },
  'COLLEGE': { text: 'Kollej', class: 'bg-teal-700 text-white font-bold border-teal-800' },
  'LANGUAGE COURSE': { text: 'Til kursi', class: 'bg-amber-600 text-white font-bold border-amber-700' }
}

function getLevelBadge(level?: string | null) {
  if (!level) return { text: 'Dastur', class: 'bg-primary-900 text-white font-bold border-primary-800' }
  const upper = level.toUpperCase()
  return levelLabels[upper] || { text: level, class: 'bg-primary-900 text-white font-bold border-primary-800' }
}

function getUniTypeBadge(type: string) {
  if (type.includes('1%')) {
    return 'bg-primary-900 text-white font-bold'
  }
  if (type.includes('Davlat')) {
    return 'bg-teal-800 text-white font-bold'
  }
  if (type.includes('Xususiy')) {
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
      label: 'Kutilmoqda',
      badgeClass: 'bg-amber-500 text-white font-bold shadow-xs',
      dotClass: 'bg-white',
      sortTimestamp: expTime
    }
  }

  const rounds = item.rounds || []
  if (rounds.length === 0) {
    return {
      type: 'outdated',
      priority: 5,
      label: 'Tugagan',
      badgeClass: 'bg-slate-500 text-white font-bold shadow-xs',
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

  // 1. Faol qabul (deadline yaqin qolganlar eng tepada)
  if (activeEndMs !== Infinity) {
    return {
      type: 'ongoing',
      priority: 1,
      label: 'Faol qabul',
      badgeClass: 'bg-emerald-600 text-white font-bold shadow-xs',
      dotClass: 'bg-white animate-pulse',
      sortTimestamp: activeEndMs
    }
  }

  // 2. X kunda ochiladi / Tez kunda (eng yaqinda ochiladigani tepada)
  if (soonStartMs !== Infinity) {
    return {
      type: 'soon',
      priority: 2,
      label: daysSoon <= 10 ? `${daysSoon} kunda ochiladi` : 'Tez kunda',
      badgeClass: 'bg-blue-600 text-white font-bold shadow-xs',
      dotClass: 'bg-white',
      sortTimestamp: soonStartMs
    }
  }

  // 3. Tugagan
  return {
    type: 'outdated',
    priority: 5,
    label: 'Tugagan',
    badgeClass: 'bg-slate-500 text-white font-bold shadow-xs',
    dotClass: 'bg-white',
    sortTimestamp: latestPastEndMs !== -Infinity ? latestPastEndMs : 0
  }
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
      const day = parseInt(parts[2], 10)
      const monthIdx = parseInt(parts[1], 10) - 1
      const month = months[monthIdx] || parts[1]
      return `${day}-${month}, ${parts[0]}`
    }
    return dateStr
  } catch {
    return dateStr
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
      const period = (item.admission_period || '').toLowerCase()
      const types = (item.university_types || []).join(' ').toLowerCase()
      return uniName.includes(query) || eduLevel.includes(query) || period.includes(query) || types.includes(query)
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
    // 1. Priority order: Ongoing (1) > Soon/X kunda ochiladi (2) > Expected (4) > Outdated (5)
    if (a.statusInfo.priority !== b.statusInfo.priority) {
      return a.statusInfo.priority - b.statusInfo.priority
    }

    // 2. Nearest date ordering within each category:
    // Ongoing (1): sort by nearest deadline (closing date) ascending
    // Soon (2): sort by nearest opening date ascending (e.g. 2 kunda ochiladi before 17 kunda)
    // Expected (4): sort by expected date ascending
    if (a.statusInfo.priority === 1 || a.statusInfo.priority === 2 || a.statusInfo.priority === 4) {
      if (a.statusInfo.sortTimestamp !== b.statusInfo.sortTimestamp) {
        return a.statusInfo.sortTimestamp - b.statusInfo.sortTimestamp
      }
    }

    // Outdated (5): sort by most recently ended descending
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
        <span>Rasmiy Qabul Taqvim Jadvali</span>
      </div>

      <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
        Universitetlarga Qabul Sanalari (Admission)
      </h2>

      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
        Janubiy Koreya universitetlariga bakalavr, magistratura va til kurslariga rasmiy qabul muddatlari, bosqichlar va arizalar taqvimi.
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
            placeholder="Universitet nomi yoki dastur bo'yicha qidirish (masalan: Korea, Bakalavr)..."
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
          Ko'rsatilmoqda: <span class="text-primary-900 dark:text-secondary-300">{{ filteredAdmissions.length }} ta</span> qabul
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
        title="Qabul e'loni topilmadi"
        description="Qidiruv so'zini yoki tanlangan filtrlarni o'zgartirib ko'ring."
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
                Universitet
              </th>
              <th class="px-4 py-3.5 min-w-[170px]">
                Dastur / Semestr
              </th>
              <th class="px-4 py-3.5 min-w-[250px]">
                Qabul Muddati
              </th>
              <th class="px-4 py-3.5 min-w-[140px] text-center">
                Holat
              </th>
              <th class="px-4 py-3.5 w-24 text-center">
                Batafsil
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
                    <div class="font-bold text-[13.5px] text-slate-900 dark:text-white leading-snug uppercase tracking-tight group-hover:text-primary-800 dark:group-hover:text-secondary-300 transition-colors">
                      {{ item.university_name }}
                    </div>

                    <!-- Badges Row -->
                    <div
                      v-if="item.university_types && item.university_types.length > 0"
                      class="flex flex-wrap items-center gap-1"
                    >
                      <span
                        v-for="ut in item.university_types"
                        :key="ut"
                        class="px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider"
                        :class="getUniTypeBadge(ut)"
                      >
                        {{ ut }}
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
                      v-if="item.rounds.length > 1"
                      :class="getRoundBadgeClass(round.roundNumber || (rIdx + 1))"
                      class="px-2 py-0.5 rounded-full font-bold text-[10.5px] tracking-wide shrink-0 shadow-2xs"
                    >
                      R{{ round.roundNumber || (rIdx + 1) }}
                    </span>
                    <span
                      v-if="round.onlineApplicationFrom && round.onlineApplicationTo"
                      class="font-semibold text-slate-900 dark:text-white"
                    >
                      {{ formatDate(round.onlineApplicationFrom) }} — {{ formatDate(round.onlineApplicationTo) }}
                    </span>
                    <span
                      v-else
                      class="text-slate-400 italic"
                    >
                      Muddat belgilanmagan
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
                    class="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"
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
                    Sanalar tez orada e'lon qilinadi
                  </div>
                </div>

                <!-- Fallback when no dates -->
                <div
                  v-else
                  class="text-[11px] text-slate-400 italic"
                >
                  Muddat kiritilmagan
                </div>
              </td>

              <!-- Status Badge -->
              <td class="px-4 py-4 text-center">
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  :class="item.statusInfo.badgeClass"
                >
                  <span
                    class="size-1.5 rounded-full"
                    :class="item.statusInfo.dotClass"
                  />
                  {{ item.statusInfo.label }}
                </span>
              </td>

              <!-- Action Button -->
              <td class="px-4 py-4 text-center">
                <button
                  type="button"
                  class="inline-flex items-center justify-center size-8 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 group-hover:bg-primary-900 group-hover:text-white transition-all cursor-pointer shadow-2xs"
                  title="Batafsil ko'rish"
                  aria-label="Batafsil ko'rish"
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
