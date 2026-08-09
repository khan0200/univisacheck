<script setup lang="ts">
const mobileMenuOpen = ref(false)
const scrolled = ref(false)

const navLinks = [
  { label: 'Viza tekshirish', to: '/visa-status' },
  { label: 'Hujjatlar', to: '#hujjatlar' },
  { label: 'Universitetlar', to: '#universitetlar' }
]

function handleScroll() {
  scrolled.value = window.scrollY > 40
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

watch(mobileMenuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMobileMenu()
}
onMounted(() => document.addEventListener('keydown', onEscape))
onUnmounted(() => document.removeEventListener('keydown', onEscape))
</script>

<template>
  <nav
    class="sticky top-0 z-40 h-16 transition-shadow duration-200"
    :class="scrolled ? 'glass shadow-sm' : 'bg-transparent'"
  >
    <div class="max-w-7xl mx-auto h-full flex items-center justify-between px-3 sm:px-4">
      <NuxtLink
        to="/"
        class="flex items-center gap-2"
      >
        <img
          src="/logo.png"
          alt="SalomKorea"
          class="h-9 w-9 rounded-lg object-contain"
        >
        <span class="font-bold text-[15px] tracking-tight text-[var(--color-text-primary)] dark:text-white">Salom<span class="text-primary-600 dark:text-secondary-300">Korea</span></span>
      </NuxtLink>

      <ul class="hidden md:flex items-center gap-1">
        <li
          v-for="link in navLinks"
          :key="link.to"
        >
          <a
            :href="link.to"
            class="px-3.5 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white hover:bg-primary-50 dark:hover:bg-white/5 transition-colors"
          >
            {{ link.label }}
          </a>
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <UButton
          to="/auth"
          color="primary"
          size="md"
          class="hidden sm:inline-flex"
          :ui="{ base: 'px-3.5 py-2' }"
          trailing-icon="i-lucide-arrow-right"
        >
          Kabinet
        </UButton>
        <UButton
          to="/auth"
          color="primary"
          size="sm"
          class="sm:hidden"
        >
          Kabinet
        </UButton>
        <button
          type="button"
          class="md:hidden flex items-center justify-center size-10 rounded-lg hover:bg-primary-50 dark:hover:bg-white/5 transition-colors"
          :aria-expanded="mobileMenuOpen"
          aria-label="Menyu"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <UIcon
            :name="mobileMenuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
            class="size-6"
          />
        </button>
      </div>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="mobileMenuOpen"
        class="md:hidden fixed inset-0 top-16 z-30 bg-white dark:bg-[var(--color-bg-dark)] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <ul class="flex-1 flex flex-col p-6 gap-1">
          <li
            v-for="link in navLinks"
            :key="link.to"
          >
            <a
              :href="link.to"
              class="block px-4 py-3.5 rounded-xl text-base font-medium text-[var(--color-text-primary)] dark:text-white hover:bg-primary-50 dark:hover:bg-white/5 transition-colors"
              @click="closeMobileMenu"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
        <div class="p-6 border-t border-[var(--color-border)] dark:border-white/[0.08]">
          <UButton
            to="/auth"
            block
            color="primary"
            size="lg"
            trailing-icon="i-lucide-arrow-right"
            @click="closeMobileMenu"
          >
            Kabinet
          </UButton>
        </div>
      </div>
    </Transition>
  </nav>
</template>
