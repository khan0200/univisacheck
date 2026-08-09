<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const router = useRouter()

type Section = 'profile' | 'universities' | 'tariff' | 'coordinators'

const sectionFromQuery = computed(() => {
  const s = String(route.query.section || '')
  const valid: Section[] = ['profile', 'universities', 'tariff', 'coordinators']
  return valid.includes(s as Section) ? (s as Section) : 'profile'
})

const activeSection = ref<Section>(sectionFromQuery.value)

watch(sectionFromQuery, (s) => {
  activeSection.value = s
})

function setSection(s: Section) {
  activeSection.value = s
  router.replace({ query: { section: s } })
}

const navItems: { key: Section, label: string, icon: string }[] = [
  { key: 'profile', label: 'Profile Settings', icon: 'i-lucide-circle-user' },
  { key: 'universities', label: 'Universities', icon: 'i-lucide-building-2' },
  { key: 'tariff', label: 'Tariff', icon: 'i-lucide-tag' },
  { key: 'coordinators', label: 'Coordinators', icon: 'i-lucide-users' }
]
</script>

<template>
  <div class="space-y-4">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)] dark:text-white">Settings</h1>
      <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">Manage your account and application configuration</p>
    </div>

    <div class="flex flex-col md:flex-row gap-5 min-h-[60vh]">
      <!-- ── Sidebar (desktop) ───────────────────────────────────────── -->
      <aside class="hidden md:flex flex-col gap-1 w-52 shrink-0">
        <nav>
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
            :class="activeSection === item.key
              ? 'bg-primary-900 text-white'
              : 'text-[var(--color-text-secondary)] hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] dark:hover:text-white'"
            @click="setSection(item.key)"
          >
            <UIcon :name="item.icon" class="size-4 shrink-0" />
            {{ item.label }}
          </button>
        </nav>
      </aside>

      <!-- ── Mobile section selector ────────────────────────────────── -->
      <div class="md:hidden">
        <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0"
            :class="activeSection === item.key
              ? 'bg-primary-900 text-white'
              : 'bg-neutral-100 dark:bg-white/[0.06] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white'"
            @click="setSection(item.key)"
          >
            <UIcon :name="item.icon" class="size-3.5 shrink-0" />
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- ── Content area ────────────────────────────────────────────── -->
      <div class="flex-1 min-w-0">
        <SettingsProfileSettings v-if="activeSection === 'profile'" />
        <SettingsUniversitiesSettings v-else-if="activeSection === 'universities'" />
        <SettingsTariffsSettings v-else-if="activeSection === 'tariff'" />
        <SettingsCoordinatorsSettings v-else-if="activeSection === 'coordinators'" />
      </div>
    </div>
  </div>
</template>
