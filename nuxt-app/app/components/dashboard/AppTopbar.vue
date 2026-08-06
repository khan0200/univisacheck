<script setup lang="ts">
const authStore = useAuthStore()
const colorMode = useColorMode()
const { show: showProfileModal } = useProfileModal()
const studentsStore = useStudentsStore()

const initials = computed(() => (authStore.user?.username || authStore.user?.email || 'U').charAt(0).toUpperCase())
const displayName = computed(() => authStore.user?.username || authStore.user?.email || 'Account')

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function handleLogout() {
  authStore.clearSession()
  navigateTo('/auth')
}

const profileMenuItems = computed(() => [
  [{ label: 'Profile settings', icon: 'i-lucide-circle-user', onSelect: showProfileModal }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: handleLogout }]
])
</script>

<template>
  <header class="h-16 shrink-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 px-3 sm:px-6 border-b border-[var(--color-border)] dark:border-white/[0.08] glass sticky top-0 z-30">
    <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 justify-self-start">
      <img src="/logo.png" alt="SalomKorea" class="h-8 w-8 rounded-lg object-contain">
      <span class="hidden sm:inline font-semibold text-[15px] tracking-tight text-primary-900 dark:text-white">SalomKorea</span>
    </NuxtLink>

    <div class="w-full min-w-0 px-2 sm:px-4 md:w-80 lg:w-96 justify-self-center">
      <UInput
        v-model="studentsStore.searchQuery"
        icon="i-lucide-search"
        placeholder="Search students…"
        size="lg"
        class="w-full"
        :ui="{ base: 'h-10' }"
      />
    </div>

    <div class="ml-auto flex items-center gap-2 justify-self-end">
      <slot name="actions" />

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
            <UIcon name="i-lucide-chevron-down" class="hidden md:inline size-4 text-[var(--color-text-secondary)]" />
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
  </header>
</template>
