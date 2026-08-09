<script setup lang="ts">
import { computed } from 'vue'
import { bucketForStatus } from '~/utils/visa-status'
import type { Student } from '~/types/student'

const studentsStore = useStudentsStore()

interface StatItem {
  name: string
  pending: number
  application: number
  approved: number
  cancelled: number
  total: number
}

function processStats(getKey: (s: Student) => string | undefined) {
  const map = new Map<string, StatItem>()
  for (const student of studentsStore.students) {
    const key = (getKey(student) || '').trim()
    if (!key || key.toLowerCase() === 'none') continue
    
    if (!map.has(key)) {
      map.set(key, { name: key, pending: 0, application: 0, approved: 0, cancelled: 0, total: 0 })
    }
    const stat = map.get(key)!
    const bucket = bucketForStatus(student.status)
    stat[bucket]++
    stat.total++
  }
  
  return Array.from(map.values())
    .filter(s => s.total > 0)
    .sort((a, b) => b.total - a.total)
}

const universityStats = computed(() => processStats(s => s.university))
const tariffStats = computed(() => processStats(s => s.tariff))

function getWidth(count: number, total: number) {
  if (total === 0 || count === 0) return '0%'
  return `${(count / total) * 100}%`
}
</script>

<template>
  <div class="space-y-8">
    <div v-if="universityStats.length > 0" class="space-y-4">
      <h3 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white uppercase tracking-wider">
        By University
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="stat in universityStats" :key="stat.name" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-[var(--color-text-primary)] dark:text-white truncate pr-2">
              {{ stat.name }}
            </span>
            <span class="text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
              {{ stat.total }} Total
            </span>
          </div>
          
          <div class="w-full h-2.5 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden flex">
            <div
              v-if="stat.pending > 0"
              class="bg-neutral-400 dark:bg-neutral-500 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.pending, stat.total) }"
              title="Pending"
            />
            <div
              v-if="stat.application > 0"
              class="bg-yellow-500 dark:bg-yellow-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.application, stat.total) }"
              title="Received"
            />
            <div
              v-if="stat.approved > 0"
              class="bg-emerald-500 dark:bg-emerald-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.approved, stat.total) }"
              title="Approved"
            />
            <div
              v-if="stat.cancelled > 0"
              class="bg-red-500 dark:bg-red-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.cancelled, stat.total) }"
              title="Cancelled"
            />
          </div>
          
          <div class="flex items-center gap-3 text-[10px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap overflow-x-auto pb-1 no-scrollbar">
            <span v-if="stat.pending > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
              Pending: <strong class="text-neutral-600 dark:text-neutral-300">{{ stat.pending }}</strong>
            </span>
            <span v-if="stat.application > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 dark:bg-yellow-400" />
              Received: <strong class="text-yellow-600 dark:text-yellow-400">{{ stat.application }}</strong>
            </span>
            <span v-if="stat.approved > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              Approved: <strong class="text-emerald-600 dark:text-emerald-400">{{ stat.approved }}</strong>
            </span>
            <span v-if="stat.cancelled > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400" />
              Cancelled: <strong class="text-red-600 dark:text-red-400">{{ stat.cancelled }}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="tariffStats.length > 0" class="space-y-4">
      <h3 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white uppercase tracking-wider">
        By Tariff
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="stat in tariffStats" :key="stat.name" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-[var(--color-text-primary)] dark:text-white truncate pr-2">
              {{ stat.name }}
            </span>
            <span class="text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
              {{ stat.total }} Total
            </span>
          </div>
          
          <div class="w-full h-2.5 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden flex">
            <div
              v-if="stat.pending > 0"
              class="bg-neutral-400 dark:bg-neutral-500 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.pending, stat.total) }"
              title="Pending"
            />
            <div
              v-if="stat.application > 0"
              class="bg-yellow-500 dark:bg-yellow-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.application, stat.total) }"
              title="Received"
            />
            <div
              v-if="stat.approved > 0"
              class="bg-emerald-500 dark:bg-emerald-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.approved, stat.total) }"
              title="Approved"
            />
            <div
              v-if="stat.cancelled > 0"
              class="bg-red-500 dark:bg-red-400 h-full transition-all duration-500"
              :style="{ width: getWidth(stat.cancelled, stat.total) }"
              title="Cancelled"
            />
          </div>
          
          <div class="flex items-center gap-3 text-[10px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap overflow-x-auto pb-1 no-scrollbar">
            <span v-if="stat.pending > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
              Pending: <strong class="text-neutral-600 dark:text-neutral-300">{{ stat.pending }}</strong>
            </span>
            <span v-if="stat.application > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 dark:bg-yellow-400" />
              Received: <strong class="text-yellow-600 dark:text-yellow-400">{{ stat.application }}</strong>
            </span>
            <span v-if="stat.approved > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              Approved: <strong class="text-emerald-600 dark:text-emerald-400">{{ stat.approved }}</strong>
            </span>
            <span v-if="stat.cancelled > 0" class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400" />
              Cancelled: <strong class="text-red-600 dark:text-red-400">{{ stat.cancelled }}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
