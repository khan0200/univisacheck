<script setup lang="ts">
import { bucketForStatus } from '~/utils/visa-status'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const studentsStore = useStudentsStore()

// Load students only if not already loaded
useAsyncData('students', () => studentsStore.loadStudents(), { server: false })

const stats = computed(() => {
  const all = studentsStore.students
  const total = all.length
  const pending = studentsStore.counts.pending
  const application = studentsStore.counts.application
  const approved = studentsStore.counts.approved
  const cancelled = studentsStore.counts.cancelled

  const underReview = all.filter(s => String(s.status || '').toLowerCase().includes('under review')).length
  const received = all.filter((s) => {
    const b = bucketForStatus(s.status)
    return b === 'application' && String(s.status || '').toLowerCase().includes('received')
  }).length

  const embassy = all.filter(s => (s.visaType || 'Embassy') === 'Embassy').length
  const evisa = all.filter(s => s.visaType === 'E-Visa').length
  const regional = all.filter(s => s.visaType === 'Regional').length

  return { total, pending, application, approved, cancelled, underReview, received, embassy, evisa, regional }
})

const statCards = computed(() => [
  { label: 'Total Students', value: stats.value.total, icon: 'i-lucide-users', color: 'bg-primary-900', textColor: 'text-white', iconBg: 'bg-white/20' },
  { label: 'Pending', value: stats.value.pending, icon: 'i-lucide-clock', color: 'bg-amber-500', textColor: 'text-white', iconBg: 'bg-white/20' },
  { label: 'Application', value: stats.value.application, icon: 'i-lucide-file-text', color: 'bg-blue-600', textColor: 'text-white', iconBg: 'bg-white/20' },
  { label: 'Approved', value: stats.value.approved, icon: 'i-lucide-check-circle', color: 'bg-emerald-600', textColor: 'text-white', iconBg: 'bg-white/20' },
  { label: 'Cancelled', value: stats.value.cancelled, icon: 'i-lucide-x-circle', color: 'bg-rose-600', textColor: 'text-white', iconBg: 'bg-white/20' },
  { label: 'Under Review', value: stats.value.underReview, icon: 'i-lucide-eye', color: 'bg-violet-600', textColor: 'text-white', iconBg: 'bg-white/20' }
])

const visaTypeBreakdown = computed(() => [
  { label: 'Embassy', value: stats.value.embassy, icon: 'i-lucide-building-2', color: 'text-primary-700 dark:text-primary-300', bar: 'bg-primary-600' },
  { label: 'E-Visa', value: stats.value.evisa, icon: 'i-lucide-globe', color: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  { label: 'Regional', value: stats.value.regional, icon: 'i-lucide-map-pin', color: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
])

const statusBreakdown = computed(() => {
  const all = studentsStore.students
  const groups: Record<string, number> = {}
  for (const s of all) {
    const label = s.status || 'Unknown'
    groups[label] = (groups[label] || 0) + 1
  }
  return Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-text-primary)] dark:text-white">
          Dashboard
        </h1>
        <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Overview of your student visa management
        </p>
      </div>
      <NuxtLink
        to="/cabinet"
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-900 text-white text-sm font-medium hover:bg-primary-800 transition-colors"
      >
        <UIcon
          name="i-lucide-layout-list"
          class="size-4"
        />
        View Cabinet
      </NuxtLink>
    </div>

    <!-- Stat Cards -->
    <ClientOnly>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          v-for="card in statCards"
          :key="card.label"
          :class="[card.color, 'rounded-xl p-4 flex flex-col gap-2 shadow-sm']"
        >
          <div :class="[card.iconBg, 'w-8 h-8 rounded-lg flex items-center justify-center']">
            <UIcon
              :name="card.icon"
              :class="[card.textColor, 'size-4']"
            />
          </div>
          <div>
            <div :class="[card.textColor, 'text-2xl font-bold tabular-nums leading-tight']">
              {{ card.value }}
            </div>
            <div :class="[card.textColor, 'text-xs font-medium opacity-80 mt-0.5']">
              {{ card.label }}
            </div>
          </div>
        </div>
      </div>

      <template #fallback>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            v-for="i in 6"
            :key="i"
            class="h-24 rounded-xl bg-neutral-100 dark:bg-white/5 animate-pulse"
          />
        </div>
      </template>
    </ClientOnly>

    <!-- Two column: Visa Type Breakdown + Status Breakdown -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Visa Type Breakdown -->
      <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white mb-4 flex items-center gap-2">
          <UIcon
            name="i-lucide-pie-chart"
            class="size-4 text-[var(--color-text-secondary)]"
          />
          Visa Type Breakdown
        </h2>
        <ClientOnly>
          <div class="space-y-4">
            <div
              v-for="item in visaTypeBreakdown"
              :key="item.label"
            >
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="item.icon"
                    :class="[item.color, 'size-4']"
                  />
                  <span class="text-sm font-medium text-[var(--color-text-primary)] dark:text-white">{{ item.label }}</span>
                </div>
                <span class="text-sm font-semibold tabular-nums text-[var(--color-text-primary)] dark:text-white">{{ item.value }}</span>
              </div>
              <div class="h-1.5 rounded-full bg-neutral-100 dark:bg-white/10 overflow-hidden">
                <div
                  :class="[item.bar, 'h-full rounded-full transition-all duration-500']"
                  :style="{ width: stats.total > 0 ? `${Math.round((item.value / stats.total) * 100)}%` : '0%' }"
                />
              </div>
            </div>
          </div>
          <template #fallback>
            <div class="space-y-4">
              <div
                v-for="i in 3"
                :key="i"
                class="h-8 rounded bg-neutral-100 dark:bg-white/5 animate-pulse"
              />
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Status Breakdown -->
      <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white mb-4 flex items-center gap-2">
          <UIcon
            name="i-lucide-bar-chart-2"
            class="size-4 text-[var(--color-text-secondary)]"
          />
          Status Distribution
        </h2>
        <ClientOnly>
          <div
            v-if="statusBreakdown.length > 0"
            class="space-y-2.5"
          >
            <div
              v-for="item in statusBreakdown"
              :key="item.label"
              class="flex items-center justify-between gap-3"
            >
              <span class="text-sm text-[var(--color-text-primary)] dark:text-neutral-300 truncate">{{ item.label }}</span>
              <span class="shrink-0 text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/10 text-[var(--color-text-secondary)] dark:text-neutral-300">
                {{ item.count }}
              </span>
            </div>
          </div>
          <div
            v-else
            class="flex items-center justify-center h-32 text-sm text-[var(--color-text-secondary)]"
          >
            No students yet
          </div>
          <template #fallback>
            <div class="space-y-2.5">
              <div
                v-for="i in 5"
                :key="i"
                class="h-7 rounded bg-neutral-100 dark:bg-white/5 animate-pulse"
              />
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- Student Statistics by University & Tariff -->
    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 shadow-sm">
      <StudentStats />
    </div>

    <!-- Quick Links -->
    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white mb-4 flex items-center gap-2">
        <UIcon
          name="i-lucide-zap"
          class="size-4 text-[var(--color-text-secondary)]"
        />
        Quick Actions
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <NuxtLink
          to="/cabinet"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group"
        >
          <div class="w-10 h-10 rounded-lg bg-primary-900/10 dark:bg-primary-300/10 flex items-center justify-center group-hover:bg-primary-900/20 transition-colors">
            <UIcon
              name="i-lucide-layout-list"
              class="size-5 text-primary-900 dark:text-primary-300"
            />
          </div>
          <span class="text-xs font-medium text-[var(--color-text-primary)] dark:text-white text-center">Student Cabinet</span>
        </NuxtLink>
        <NuxtLink
          to="/settings"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group"
        >
          <div class="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
            <UIcon
              name="i-lucide-settings"
              class="size-5 text-violet-600 dark:text-violet-400"
            />
          </div>
          <span class="text-xs font-medium text-[var(--color-text-primary)] dark:text-white text-center">Settings</span>
        </NuxtLink>
        <NuxtLink
          to="/settings?section=universities"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group"
        >
          <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
            <UIcon
              name="i-lucide-building-2"
              class="size-5 text-blue-600 dark:text-blue-400"
            />
          </div>
          <span class="text-xs font-medium text-[var(--color-text-primary)] dark:text-white text-center">Universities</span>
        </NuxtLink>
        <NuxtLink
          to="/settings?section=coordinators"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group"
        >
          <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
            <UIcon
              name="i-lucide-users"
              class="size-5 text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <span class="text-xs font-medium text-[var(--color-text-primary)] dark:text-white text-center">Coordinators</span>
        </NuxtLink>
        <NuxtLink
          to="/settings?section=b2b"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group"
        >
          <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
            <UIcon
              name="i-lucide-briefcase"
              class="size-5 text-amber-600 dark:text-amber-400"
            />
          </div>
          <span class="text-xs font-medium text-[var(--color-text-primary)] dark:text-white text-center">B2B Partners</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
