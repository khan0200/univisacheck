<script setup lang="ts">
import type { University } from '~/types/university'
import type { ProgramFilter } from '~/composables/useUniversities'

const { universities, pending, searchQuery, locationFilter, accreditationFilter, sortByRank, locations, filtered } = useUniversities()

const programFilters: { value: ProgramFilter, label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: '1percent', label: "🥇 1% Universitetlar" },
  { value: 'master', label: 'Master' },
  { value: 'master-evisa', label: 'Master E-Viza' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'college', label: 'College' },
  { value: 'language-course', label: 'Language Course' },
  { value: 'regional', label: 'Regional' }
]

const visibleCount = ref(12)
const visible = computed(() => filtered.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < filtered.value.length)

watch([searchQuery, locationFilter, accreditationFilter], () => {
  visibleCount.value = 12
})

function loadMore() {
  visibleCount.value += 12
}

const detailsOpen = ref(false)
const selectedUniversity = ref<University | null>(null)
function openDetails(university: University) {
  selectedUniversity.value = university
  detailsOpen.value = true
}
</script>

<template>
  <section id="universitetlar" class="max-w-7xl mx-auto px-3 sm:px-4 py-16 sm:py-20 scroll-mt-16">
    <div class="text-center max-w-xl mx-auto mb-10">
      <span class="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-secondary-300">Universitetlar katalogi</span>
      <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)] dark:text-white mt-2">
        {{ universities.length }}+ Koreya universiteti haqida to'liq ma'lumot
      </h2>
    </div>

    <div class="rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] p-4 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Universitet, joylashuv yoki yo'nalish bo'yicha qidirish…"
          size="lg"
          class="flex-1"
        />
        <USelect
          v-model="locationFilter"
          :items="locations.map((l) => ({ value: l, label: l === 'all' ? 'Barcha joylar' : l }))"
          value-key="value"
          label-key="label"
          size="lg"
          class="sm:w-48"
        />
        <UButton
          :color="sortByRank ? 'primary' : 'neutral'"
          :variant="sortByRank ? 'solid' : 'outline'"
          size="lg"
          icon="i-lucide-arrow-up-narrow-wide"
          @click="sortByRank = !sortByRank"
        >
          Reyting bo'yicha
        </UButton>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button
          v-for="f in programFilters"
          :key="f.value"
          type="button"
          class="px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors"
          :class="accreditationFilter === f.value ? 'bg-primary-900 text-white ring-2 ring-primary-900 ring-offset-1' : 'bg-primary-50 text-primary-800 hover:bg-primary-100 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'"
          @click="accreditationFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="pending" class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
      <div v-for="i in 8" :key="i" class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden">
        <div class="h-40 bg-neutral-100 dark:bg-white/5 animate-pulse" />
        <div class="p-4 space-y-2">
          <div class="h-4 w-3/4 rounded bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
          <div class="h-3 w-1/2 rounded bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
          <div class="h-6 w-full rounded bg-neutral-200/70 dark:bg-white/10 animate-pulse mt-3" />
        </div>
      </div>
    </div>
    <div v-else-if="filtered.length === 0">
      <UiEmptyState icon="i-lucide-search" title="Universitet topilmadi" description="Qidiruv so'zini yoki filtrni o'zgartirib ko'ring." />
    </div>
    <template v-else>
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
        <UniversityCard
          v-for="u in visible"
          :key="u.name"
          :university="u"
          @open="openDetails"
        />
      </div>

      <div v-if="hasMore" class="flex justify-center mt-8">
        <UButton color="neutral" variant="outline" size="lg" @click="loadMore">
          Yana ko'rsatish ({{ filtered.length - visibleCount }})
        </UButton>
      </div>
    </template>

    <p class="text-center text-xs text-[var(--color-text-secondary)] mt-10">
      Ma'lumotlar rasmiy universitet manbalaridan yig'ilgan va muntazam yangilanadi.
    </p>

    <UniversityDetailsModal v-model:open="detailsOpen" :university="selectedUniversity" />
  </section>
</template>
