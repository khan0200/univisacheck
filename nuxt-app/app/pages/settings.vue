<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const router = useRouter()

type Section = 'profile' | 'universities' | 'tariff' | 'coordinators' | 'b2b'

const sectionFromQuery = computed(() => {
  const s = String(route.query.section || '')
  const valid: Section[] = ['profile', 'universities', 'tariff', 'coordinators', 'b2b']
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
  { key: 'coordinators', label: 'Coordinators', icon: 'i-lucide-users' },
  { key: 'b2b', label: 'B2B', icon: 'i-lucide-briefcase' }
]

const mobileDropdownItems = computed(() => [
  navItems.map(item => ({
    label: item.label,
    icon: activeSection.value === item.key ? 'i-lucide-check' : item.icon,
    onSelect: () => setSection(item.key)
  }))
])
</script>

<template>
  <div class="space-y-4">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-text-primary)] dark:text-white">
          Settings
        </h1>
        <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Manage your account and application configuration
        </p>
      </div>
      <NuxtLink
        to="/cabinet"
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-900 text-white text-sm font-medium hover:bg-primary-800 transition-colors shrink-0"
      >
        <UIcon
          name="i-lucide-layout-list"
          class="size-4"
        />
        Back to Cabinet
      </NuxtLink>
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
            <UIcon
              :name="item.icon"
              class="size-4 shrink-0"
            />
            {{ item.label }}
          </button>
        </nav>
      </aside>

      <!-- ── Mobile section selector ────────────────────────────────── -->
      <div class="md:hidden w-full">
        <ClientOnly>
          <UDropdownMenu :items="mobileDropdownItems" :ui="{ content: 'w-[calc(100vw-2rem)]' }">
            <button
              type="button"
              class="w-full flex items-center justify-between h-11 rounded-xl px-4 border border-[var(--color-border)] dark:border-white/[0.12] bg-white dark:bg-white/[0.05] hover:bg-neutral-50 dark:hover:bg-white/[0.08] text-sm font-medium text-[var(--color-text-primary)] dark:text-white transition-colors ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05]"
            >
              <div class="flex items-center gap-2.5">
                <UIcon
                  :name="navItems.find(n => n.key === activeSection)?.icon || 'i-lucide-settings'"
                  class="size-4.5 text-[var(--color-text-secondary)]"
                />
                <span>{{ navItems.find(n => n.key === activeSection)?.label }}</span>
              </div>
              <UIcon
                name="i-lucide-chevrons-up-down"
                class="size-4 text-[var(--color-text-secondary)] shrink-0"
              />
            </button>
          </UDropdownMenu>
        </ClientOnly>
      </div>

      <!-- ── Content area ────────────────────────────────────────────── -->
      <div class="flex-1 min-w-0">
        <SettingsProfileSettings v-if="activeSection === 'profile'" />
        <SettingsUniversitiesSettings v-else-if="activeSection === 'universities'" />
        <SettingsTariffsSettings v-else-if="activeSection === 'tariff'" />
        <SettingsCoordinatorsSettings v-else-if="activeSection === 'coordinators'" />
        <SettingsB2BSettings v-else-if="activeSection === 'b2b'" />
      </div>
    </div>
  </div>
</template>
