<script setup lang="ts">
import {
  ACCREDITED_UNIVERSITIES,
  JUNIOR_COLLEGES,
  ONE_PERCENT_UNIVERSITIES,
  ONE_PERCENT_COLLEGES,
  RESTRICTED_BACHELOR_UNIVERSITIES,
  RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES,
  K_CORE_PROGRAMS
} from '~/data/accredited-universities'

type ListCategory = 'accredited' | 'college' | '1percent' | '1percent-college' | 'restricted-bachelor' | 'restricted-language'
type FilterValue = ListCategory | 'k-core'

interface CategoryBlock {
  category: ListCategory
  title: string
  headerBarClass: string
  fallbackBadge: string
  names: string[]
}

const BLOCKS: CategoryBlock[] = [
  { category: 'accredited', title: 'Accredited Universities', headerBarClass: 'bg-primary-700', fallbackBadge: 'Accredited', names: ACCREDITED_UNIVERSITIES },
  { category: 'college', title: 'Junior Colleges', headerBarClass: 'bg-purple-700', fallbackBadge: 'College', names: JUNIOR_COLLEGES },
  { category: '1percent', title: '1% Universities', headerBarClass: 'bg-danger-600', fallbackBadge: '1% Akkred.', names: ONE_PERCENT_UNIVERSITIES },
  { category: '1percent-college', title: '1% Colleges', headerBarClass: 'bg-primary-900', fallbackBadge: '1% Lik Kollej', names: ONE_PERCENT_COLLEGES },
  { category: 'restricted-bachelor', title: 'Restricted — Bachelor Admission', headerBarClass: 'bg-warning-600', fallbackBadge: 'Restricted', names: RESTRICTED_BACHELOR_UNIVERSITIES },
  { category: 'restricted-language', title: 'Restricted — Language Course Admission', headerBarClass: 'bg-warning-700', fallbackBadge: 'Restricted', names: RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES }
]

const filterTabs: { value: FilterValue, label: string }[] = [
  { value: '1percent', label: '1% Universities' },
  { value: '1percent-college', label: '1% Colleges' },
  { value: 'accredited', label: 'Accredited' },
  { value: 'college', label: 'Junior Colleges' },
  { value: 'restricted-bachelor', label: 'Restricted (Bachelor)' },
  { value: 'restricted-language', label: 'Restricted (Language Course)' },
  { value: 'k-core', label: 'K-CORE Visa' }
]

const searchQuery = ref('')
const activeFilter = ref<FilterValue>('1percent')

// Cross-reference against the live catalog for real QS-rank badges, keyed by
// a normalized name since punctuation/spacing differ between this reference
// list and the Turso-backed catalog (e.g. "Chungnam National University(CNU)"
// vs "Chungnam National University (CNU)").
const { universities } = useUniversities()

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Condenses a messy qsRank string into a compact "QS #NN" / "TOP NN" style badge. */
function condenseRank(text: string): string | null {
  const hashMatch = text.match(/#[\d-]+/)
  if (hashMatch) return `QS ${hashMatch[0]}`
  const topMatch = text.match(/TOP\s+[\d-]+/i)
  if (topMatch) return topMatch[0].toUpperCase()
  return null
}

const rankByNormalizedName = computed(() => {
  const map = new Map<string, string>()
  for (const u of universities.value) {
    if (!u.qsRank) continue
    const condensed = condenseRank(u.qsRank)
    if (condensed) map.set(normalize(u.name), condensed)
  }
  return map
})

function badgeFor(name: string, fallback: string): string {
  return rankByNormalizedName.value.get(normalize(name)) || fallback
}

const visibleBlocks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return BLOCKS
    .filter((block) => activeFilter.value === block.category)
    .map((block) => ({
      ...block,
      rows: block.names
        .filter((name) => !q || name.toLowerCase().includes(q))
        .map((name, i) => ({ index: i + 1, name, badge: badgeFor(name, block.fallbackBadge) }))
    }))
    .filter((block) => block.rows.length > 0)
})

const visibleKCorePrograms = computed(() => {
  if (activeFilter.value !== 'k-core') return []
  const q = searchQuery.value.trim().toLowerCase()
  return K_CORE_PROGRAMS
    .filter((p) => !q || p.university.toLowerCase().includes(q) || p.major.toLowerCase().includes(q) || p.region.toLowerCase().includes(q))
    .map((p, i) => ({ index: i + 1, ...p }))
})

const totalShown = computed(() =>
  visibleBlocks.value.reduce((sum, b) => sum + b.rows.length, 0) + visibleKCorePrograms.value.length
)
</script>

<template>
  <section class="max-w-7xl mx-auto px-3 sm:px-4 py-16 sm:py-20 scroll-mt-16">
    <div class="text-center max-w-2xl mx-auto mb-10">
      <span class="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-secondary-300">Accreditation Reference</span>
      <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)] dark:text-white mt-2">
        Full List of Accredited Universities &amp; Colleges
      </h2>
      <p class="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
        Reference list of accredited universities, junior colleges, 1% visa-simplified institutions, and institutions currently under visa restriction.
      </p>
    </div>

    <div class="rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] p-4 mb-8">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search by university name…"
        size="lg"
        class="w-full"
      />
      <div class="flex flex-wrap gap-2 mt-3">
        <button
          v-for="f in filterTabs"
          :key="f.value"
          type="button"
          class="px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors"
          :class="activeFilter === f.value ? 'bg-primary-900 text-white ring-2 ring-primary-900 ring-offset-1' : 'bg-primary-50 text-primary-800 hover:bg-primary-100 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'"
          @click="activeFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="visibleBlocks.length === 0 && visibleKCorePrograms.length === 0" class="rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] p-8">
      <UiEmptyState icon="i-lucide-search" title="No universities found" description="Try adjusting your search or filter." />
    </div>

    <div v-else class="space-y-8">
      <div v-if="visibleKCorePrograms.length > 0">
        <h3 class="flex items-center gap-2.5 text-base font-bold text-[var(--color-text-primary)] dark:text-white mb-3">
          <span class="w-1 h-5 rounded-full bg-teal-600" />
          K-CORE Visa ({{ visibleKCorePrograms.length }})
        </h3>

        <div class="flex items-start gap-3 mb-4 p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900">
          <UIcon name="i-lucide-badge-check" class="size-4.5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
          <p class="text-sm text-teal-900 dark:text-teal-200 leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span class="font-semibold">No KDB bank statement, no parent income document required</span>
            <span>for these Development-type Technical Departments — applies to applicants with</span>
            <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-sm bg-teal-600 text-white whitespace-nowrap">TOPIK 3+</span>
          </p>
        </div>

        <div class="rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-primary-50/60 dark:bg-white/5">
                <tr class="text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <th class="px-4 py-2.5 w-10">#</th>
                  <th class="px-4 py-2.5">Region</th>
                  <th class="px-4 py-2.5">University</th>
                  <th class="px-4 py-2.5">Major</th>
                  <th class="px-4 py-2.5">Language</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
                <tr v-for="row in visibleKCorePrograms" :key="row.index">
                  <td class="px-4 py-3 text-[var(--color-text-secondary)]">{{ row.index }}</td>
                  <td class="px-4 py-3">
                    <span class="text-[10.5px] font-bold px-2 py-1 rounded-sm bg-teal-600 text-white whitespace-nowrap">{{ row.region }}</span>
                  </td>
                  <td class="px-4 py-3 font-medium text-[var(--color-text-primary)] dark:text-white">{{ row.university }}</td>
                  <td class="px-4 py-3 text-[var(--color-text-secondary)]">{{ row.major }}</td>
                  <td class="px-4 py-3">
                    <span class="text-[10.5px] font-bold px-2 py-1 rounded-sm bg-primary-50 text-primary-800 dark:bg-white/10 dark:text-white whitespace-nowrap">TOPIK 3+</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-for="block in visibleBlocks" :key="block.category">
        <h3 class="flex items-center gap-2.5 text-base font-bold text-[var(--color-text-primary)] dark:text-white mb-3">
          <span :class="['w-1 h-5 rounded-full', block.headerBarClass]" />
          {{ block.title }} ({{ block.rows.length }})
        </h3>

        <div class="rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden">
          <div class="grid sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="col in 3"
              :key="col"
              class="hidden lg:block px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] bg-primary-50/60 dark:bg-white/5"
              :class="{ 'border-l border-[var(--color-border)] dark:border-white/[0.08]': col > 1 }"
            >
              Name
            </div>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 divide-y divide-[var(--color-border)] dark:divide-white/[0.06] lg:divide-y-0">
            <div
              v-for="row in block.rows"
              :key="row.name"
              class="flex items-center justify-between gap-2 px-4 py-3 text-sm lg:border-b lg:border-[var(--color-border)] lg:dark:border-white/[0.06]"
            >
              <span class="min-w-0 truncate">
                <span class="text-[var(--color-text-secondary)] mr-1.5">{{ row.index }}.</span>
                <span class="font-medium text-[var(--color-text-primary)] dark:text-white">{{ row.name }}</span>
              </span>
              <span class="shrink-0 text-[10.5px] font-bold px-2 py-1 rounded-sm bg-primary-900 text-white whitespace-nowrap">
                {{ row.badge }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="text-center text-xs text-[var(--color-text-secondary)] mt-8">
      {{ totalShown }} institutions shown.
    </p>
  </section>
</template>
