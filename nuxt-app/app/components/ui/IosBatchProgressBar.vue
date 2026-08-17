<script setup lang="ts">
const studentsStore = useStudentsStore()

const progress = computed(() => studentsStore.batchCheckProgress)
const isActive = computed(() => progress.value.active && progress.value.total > 0)
const isFinished = computed(() => progress.value.total > 0 && progress.value.completed >= progress.value.total)

const percentage = computed(() => {
  if (!progress.value.total) return 0
  const pct = Math.round((progress.value.completed / progress.value.total) * 100)
  return Math.min(100, Math.max(0, pct))
})
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
    enter-from-class="opacity-0 translate-y-8 scale-90"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-6 scale-95"
  >
    <div
      v-if="isActive"
      class="fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto select-none"
    >
      <div
        class="flex flex-col gap-2 px-5 py-3 rounded-2xl sm:rounded-full bg-neutral-900/90 dark:bg-black/90 backdrop-blur-2xl border border-white/20 dark:border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(16,185,129,0.15)] min-w-[280px] sm:min-w-[320px] max-w-[92vw] text-white"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5">
            <!-- iOS Spinner or Finished Checkmark -->
            <div class="relative flex items-center justify-center size-5 shrink-0">
              <template v-if="isFinished">
                <UIcon
                  name="i-lucide-check-circle-2"
                  class="size-5 text-emerald-400 animate-bounce"
                />
              </template>
              <template v-else>
                <UIcon
                  name="i-lucide-loader-2"
                  class="size-5 text-emerald-400 animate-spin"
                />
              </template>
            </div>

            <span class="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
              <span>Tekshirilmoqda</span>
              <span class="font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded text-xs">
                {{ progress.completed }}/{{ progress.total }}
              </span>
            </span>
          </div>

          <span class="text-xs font-mono font-bold text-neutral-400">
            {{ percentage }}%
          </span>
        </div>

        <!-- Sleek iOS progress line -->
        <div class="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.6)]"
            :style="{ width: `${percentage}%` }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>
