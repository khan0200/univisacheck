<script setup lang="ts">
const heroBg = ref<HTMLElement | null>(null)

function handleScroll() {
  if (!heroBg.value) return
  const y = Math.min(window.scrollY, 400)
  heroBg.value.style.transform = `translateY(${y * 0.15}px) scale(${1 + y * 0.0003})`
}

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))

const features = [
  { to: '/visa-status', icon: 'i-lucide-shield-check', label: 'Viza holati', desc: 'Real vaqtda viza statusingizni tekshiring' },
  { to: '#hujjatlar', icon: 'i-lucide-file-text', label: 'Hujjatlar ro\'yxati', desc: 'Kerakli hujjatlar to\'liq ro\'yxati' },
  { to: '#universitetlar', icon: 'i-lucide-landmark', label: 'Universitetlar katalogi', desc: '50+ universitet haqida to\'liq ma\'lumot' }
]

const infoStrip = [
  { icon: 'i-lucide-database', title: "Ma'lumotlar bazasi", desc: '50+ universitet' },
  { icon: 'i-lucide-shield-check', title: 'Ishonchli manbalar', desc: "Rasmiy ma'lumotlar" },
  { icon: 'i-lucide-refresh-cw', title: 'Doimiy yangilanadi', desc: 'Har hafta tekshiriladi' },
  { icon: 'i-lucide-sparkles', title: 'Oson va qulay', desc: 'Bir necha klikda' }
]
</script>

<template>
  <section id="home" class="relative overflow-hidden">
    <div ref="heroBg" class="absolute inset-0 -z-10 bg-gradient-to-br from-primary-50 via-white to-secondary-50/40 dark:from-primary-950/40 dark:via-[var(--color-bg-dark)] dark:to-primary-950/20" />

    <div class="max-w-7xl mx-auto px-3 sm:px-4 pt-16 pb-14 sm:pt-20 sm:pb-20">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-primary-900 text-xs font-semibold text-white mb-5">
            <span class="size-1.5 rounded-full bg-success-400" />
            <span class="size-1.5 rounded-full bg-secondary-400" />
            Koreya ta'lim va viza platformasi
          </span>
          <h1 class="text-[32px] sm:text-[44px] font-bold tracking-tight leading-[1.1] text-[var(--color-text-primary)] dark:text-white">
            Koreyada o'qish yo'lingiz <em class="not-italic text-primary-600 dark:text-secondary-300">shu yerdan</em> boshlanadi
          </h1>
          <p class="mt-5 text-base text-[var(--color-text-secondary)] leading-relaxed max-w-lg">
            Universitet tanlash, hujjatlar tayyorlash va viza holatini kuzatish — barchasi bitta platformada, tez va ishonchli.
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <UButton href="#universitetlar" size="xl" color="primary" trailing-icon="i-lucide-arrow-right" :ui="{ base: 'px-5 py-3' }">
              Universitetlarni ko'rish
            </UButton>
            <UButton to="/visa-status" size="xl" color="neutral" variant="outline" icon="i-lucide-shield-check" :ui="{ base: 'px-5 py-3' }">
              Viza holatini tekshirish
            </UButton>
          </div>
        </div>

        <div class="relative">
          <div class="rounded-3xl overflow-hidden shadow-xl border border-[var(--color-border)] dark:border-white/[0.08]">
            <img src="/hero_banner.png" alt="Study in Korea" class="w-full h-auto object-cover">
          </div>
          <a
            href="#universitetlar"
            class="absolute -bottom-5 -left-5 sm:-left-8 flex items-center gap-3 bg-white dark:bg-[var(--color-card-dark)] rounded-xl shadow-lg border border-[var(--color-border)] dark:border-white/[0.08] px-4 py-3.5 hover:-translate-y-0.5 transition-transform"
          >
            <span class="text-2xl">🇰🇷</span>
            <span class="flex flex-col leading-tight">
              <span class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white">50+ Universitet</span>
              <span class="text-xs text-[var(--color-text-secondary)]">Batafsil ma'lumot bilan</span>
            </span>
            <UIcon name="i-lucide-arrow-right" class="size-4 text-[var(--color-text-secondary)] ml-1" />
          </a>
        </div>
      </div>

      <div class="grid sm:grid-cols-3 gap-4 mt-16">
        <a
          v-for="f in features"
          :key="f.to"
          :href="f.to"
          class="group flex items-start gap-3.5 p-5 rounded-xl bg-white dark:bg-[var(--color-card-dark)] border border-[var(--color-border)] dark:border-white/[0.08] hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div class="flex items-center justify-center size-10 rounded-xl bg-primary-50 dark:bg-white/5 text-primary-700 dark:text-secondary-300 shrink-0">
            <UIcon :name="f.icon" class="size-5" />
          </div>
          <div class="flex-1">
            <p class="font-semibold text-sm text-[var(--color-text-primary)] dark:text-white">{{ f.label }}</p>
            <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">{{ f.desc }}</p>
          </div>
          <UIcon name="i-lucide-arrow-right" class="size-4 text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all mt-2" />
        </a>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div v-for="item in infoStrip" :key="item.title" class="flex items-center gap-2.5">
          <div class="flex items-center justify-center size-8 rounded-lg bg-primary-50 dark:bg-white/5 text-primary-700 dark:text-secondary-300 shrink-0">
            <UIcon :name="item.icon" class="size-4" />
          </div>
          <div class="leading-tight">
            <p class="text-xs font-semibold text-[var(--color-text-primary)] dark:text-white">{{ item.title }}</p>
            <p class="text-[11px] text-[var(--color-text-secondary)]">{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
