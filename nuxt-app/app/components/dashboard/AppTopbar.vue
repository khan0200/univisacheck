<script setup lang="ts">
import type { Student, VisaTypeFilter } from '~/types/student'

defineProps<{ realtimeStatus?: string }>()
const authStore = useAuthStore()
const colorMode = useColorMode()
const studentsStore = useStudentsStore()

const initials = computed(() => (authStore.user?.username || authStore.user?.email || 'U').charAt(0).toUpperCase())
const displayName = computed(() => authStore.user?.username || authStore.user?.email || 'Account')

const addStudentModalOpen = useState('addStudentModalOpen', () => false)
const editingStudent = useState<Student | null>('editingStudent', () => null)

function openAddModal() {
  editingStudent.value = null
  addStudentModalOpen.value = true
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function handleLogout() {
  authStore.clearSession()
  navigateTo('/auth')
}

const profileMenuItems = computed(() => [
  [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', onSelect: () => navigateTo('/dashboard') },
    { label: 'Admission', icon: 'i-lucide-graduation-cap', onSelect: () => navigateTo('/#admission') },
    { label: 'Visa Status', icon: 'i-lucide-search', onSelect: () => navigateTo('/visa-status') },
    { label: 'Settings', icon: 'i-lucide-settings', onSelect: () => navigateTo('/settings') }
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: handleLogout }]
])

// ── Visa-type filter dropdown ────────────────────────────────────────────────
const visaFilterOptions: { value: VisaTypeFilter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Embassy', label: 'Embassy' },
  { value: 'E-Visa', label: 'E-Visa' },
  { value: 'Regional', label: 'Regional' }
]

const selectedFilterLabel = computed(() =>
  visaFilterOptions.find(o => o.value === studentsStore.visaTypeFilter)?.label ?? 'All'
)

const visaFilterMenuItems = computed(() =>
  [visaFilterOptions.map(opt => ({
    label: opt.label,
    icon: studentsStore.visaTypeFilter === opt.value ? 'i-lucide-check' : '',
    slot: `visa-${opt.value}` as string,
    _value: opt.value,
    _count: studentsStore.visaTypeCounts[opt.value] ?? 0,
    onSelect: () => studentsStore.setVisaTypeFilter(opt.value)
  }))]
)
</script>

<template>
  <!--
    Mobile  (<sm): two-row layout
      Row 1 — logo + controls (realtime, theme, profile)
      Row 2 — search input + filter dropdown

    Desktop (≥sm): single-row with logo | search+filter | controls
  -->
  <header class="shrink-0 sticky top-0 z-30 border-b border-[var(--color-border)] dark:border-white/[0.08] glass">
    <!-- ── Mobile: Row 1 — Logo + controls ──────────────────────────── -->
    <div class="flex items-center justify-between gap-2 px-4 h-14 sm:hidden">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex items-center gap-2 shrink-0"
      >
        <img
          src="/logo.png"
          alt="SalomKorea"
          class="h-8 w-8 rounded-lg object-contain"
        >
        <span class="font-semibold text-[15px] tracking-tight text-primary-900 dark:text-white">SalomKorea</span>
      </NuxtLink>

      <!-- Right controls -->
      <div class="flex items-center gap-1.5 shrink-0">
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          class="px-2.5 font-semibold text-white"
          @click="openAddModal"
        >
          Add
        </UButton>

        <UButton
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          color="neutral"
          variant="ghost"
          square
          size="sm"
          aria-label="Toggle dark mode"
          @click="toggleColorMode"
        />

        <ClientOnly>
          <UDropdownMenu :items="profileMenuItems">
            <button
              type="button"
              class="flex items-center justify-center size-9 rounded-full bg-primary-900 text-secondary-300 text-sm font-semibold"
            >
              {{ initials }}
            </button>
          </UDropdownMenu>
          <template #fallback>
            <span class="flex items-center justify-center size-9 rounded-full bg-primary-900/20" />
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- ── Mobile: Row 2 — Search + filter ──────────────────────────── -->
    <div class="flex items-center gap-2 px-4 pb-3 sm:hidden">
      <UInput
        v-model="studentsStore.searchQuery"
        icon="i-lucide-search"
        placeholder="Search students, university..."
        size="md"
        class="flex-1 min-w-0"
        :ui="{ base: 'h-10' }"
      />

      <ClientOnly>
        <UDropdownMenu :items="visaFilterMenuItems">
          <button
            type="button"
            class="flex items-center gap-1 h-10 rounded-lg px-2.5 shrink-0 border border-[var(--color-border)] dark:border-white/[0.12] bg-white dark:bg-white/[0.05] hover:bg-neutral-50 dark:hover:bg-white/[0.08] text-sm font-medium text-[var(--color-text-primary)] dark:text-white transition-colors ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05] whitespace-nowrap"
            aria-label="Filter by visa type"
          >
            <span class="text-[13px]">{{ selectedFilterLabel }}</span>
            <span class="text-[11px] font-semibold tabular-nums px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 leading-none">
              {{ studentsStore.visaTypeCounts[studentsStore.visaTypeFilter] ?? 0 }}
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 text-[var(--color-text-secondary)] shrink-0"
            />
          </button>

          <template
            v-for="opt in visaFilterOptions"
            :key="opt.value"
            #[`visa-${opt.value}-trailing`]
          >
            <span class="text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)] dark:text-neutral-400 ml-auto pl-3">
              {{ studentsStore.visaTypeCounts[opt.value] ?? 0 }}
            </span>
          </template>
        </UDropdownMenu>
        <template #fallback>
          <div class="h-10 w-20 rounded-lg bg-neutral-100 dark:bg-white/5 shrink-0" />
        </template>
      </ClientOnly>
    </div>

    <!-- ── Desktop (≥sm): single-row ────────────────────────────────── -->
    <div class="hidden sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-6 sm:h-16">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 shrink-0 justify-self-start"
      >
        <img
          src="/logo.png"
          alt="SalomKorea"
          class="h-8 w-8 rounded-lg object-contain"
        >
        <span class="hidden md:inline font-semibold text-[15px] tracking-tight text-primary-900 dark:text-white">SalomKorea</span>
      </NuxtLink>

      <!-- Search + filter dropdown -->
      <div class="w-full min-w-0 px-4 justify-self-center flex items-center gap-2 max-w-2xl mx-auto">
        <UInput
          v-model="studentsStore.searchQuery"
          icon="i-lucide-search"
          placeholder="Search students, university..."
          size="lg"
          class="flex-1 min-w-0"
          :ui="{ base: 'h-10' }"
        />

        <ClientOnly>
          <UDropdownMenu :items="visaFilterMenuItems">
            <button
              type="button"
              class="flex items-center gap-1.5 h-10 rounded-lg px-2.5 shrink-0 border border-[var(--color-border)] dark:border-white/[0.12] bg-white dark:bg-white/[0.05] hover:bg-neutral-50 dark:hover:bg-white/[0.08] text-sm font-medium text-[var(--color-text-primary)] dark:text-white transition-colors ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05] whitespace-nowrap"
              aria-label="Filter by visa type"
            >
              <span>{{ selectedFilterLabel }}</span>
              <span class="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 leading-none">
                {{ studentsStore.visaTypeCounts[studentsStore.visaTypeFilter] ?? 0 }}
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3.5 text-[var(--color-text-secondary)] shrink-0"
              />
            </button>

            <template
              v-for="opt in visaFilterOptions"
              :key="opt.value"
              #[`visa-${opt.value}-trailing`]
            >
              <span class="text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)] dark:text-neutral-400 ml-auto pl-3">
                {{ studentsStore.visaTypeCounts[opt.value] ?? 0 }}
              </span>
            </template>
          </UDropdownMenu>
          <template #fallback>
            <div class="h-10 w-24 rounded-lg bg-neutral-100 dark:bg-white/5 shrink-0" />
          </template>
        </ClientOnly>
      </div>

      <!-- Right controls -->
      <div class="ml-auto flex items-center gap-2 justify-self-end">
        <slot name="actions" />

        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          class="px-3 font-semibold text-white"
          @click="openAddModal"
        >
          Add
        </UButton>

        <UButton
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          color="neutral"
          variant="ghost"
          square
          aria-label="Toggle dark mode"
          @click="toggleColorMode"
        />

        <ClientOnly>
          <UDropdownMenu :items="profileMenuItems">
            <button
              type="button"
              class="flex items-center gap-2 rounded-md pl-1 pr-3 py-1 hover:bg-primary-50 dark:hover:bg-white/5 transition-colors"
            >
              <span class="flex items-center justify-center size-8 rounded-full bg-primary-900 text-secondary-300 text-sm font-semibold">
                {{ initials }}
              </span>
              <span class="hidden md:inline text-sm font-medium text-[var(--color-text-primary)] dark:text-white">{{ displayName }}</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="hidden md:inline size-4 text-[var(--color-text-secondary)]"
              />
            </button>
          </UDropdownMenu>
          <template #fallback>
            <div class="flex items-center gap-2 pl-1 pr-3 py-1">
              <span class="flex items-center justify-center size-8 rounded-full bg-primary-900/20" />
              <span class="hidden md:inline h-4 w-16 rounded bg-primary-900/10" />
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </header>
</template>
