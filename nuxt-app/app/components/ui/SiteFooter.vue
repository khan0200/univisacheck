<script setup lang="ts">
const links = [
  { label: 'Bosh sahifa', to: '/' },
  { label: 'Admission', to: '/#admission' },
  { label: 'Hujjatlar', to: '/#hujjatlar' },
  { label: 'Universitetlar', to: '/#universitetlar' },
  { label: 'Viza tekshirish', to: '/visa-status' },
  { label: 'Kabinet', to: '/auth' }
]
</script>

<template>
  <footer class="border-t border-[var(--color-border)] dark:border-white/[0.08] mt-8">
    <div class="max-w-7xl mx-auto px-3 sm:px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-2.5">
        <img
          src="/logo.png"
          alt="SalomKorea"
          class="h-8 w-8 rounded-lg object-contain"
        >
        <span class="font-semibold text-sm text-[var(--color-text-primary)] dark:text-white">SalomKorea</span>
      </div>
      <nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white transition-colors"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <p class="text-xs text-[var(--color-text-secondary)]">
        © {{ new Date().getFullYear() }} SalomKorea
      </p>
    </div>
  </footer>
</template>
