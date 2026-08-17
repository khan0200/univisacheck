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
    enter-from-class="opacity-0 translate-y-8 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-6 scale-95"
  >
    <div
      v-if="isActive"
      class="fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto select-none"
    >
      <!-- Apple Dynamic Island / Live Activity Glass Capsule -->
      <div
        class="ios-live-pill relative flex flex-col gap-2.5 px-4.5 py-3 sm:px-5 sm:py-3.5 rounded-[22px] min-w-[290px] sm:min-w-[340px] max-w-[92vw] text-white shadow-2xl overflow-hidden"
      >
        <!-- Top Status Row -->
        <div class="flex items-center justify-between gap-3 sm:gap-4">
          <div class="flex items-center gap-2.5 min-w-0">
            <!-- Left Animated Indicator: iOS Circular Ring or Checkmark -->
            <div class="relative flex items-center justify-center size-4.5 sm:size-5 shrink-0">
              <Transition
                mode="out-in"
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 scale-75 rotate-45"
                enter-to-class="opacity-100 scale-100 rotate-0"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-75"
              >
                <!-- Completed State Checkmark -->
                <div
                  v-if="isFinished"
                  key="finished"
                  class="flex items-center justify-center size-4.5 sm:size-5 rounded-full bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                >
                  <svg
                    class="size-3.5 sm:size-4 stroke-current stroke-[2.5]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>

                <!-- Animated iOS Ring Spinner -->
                <div
                  v-else
                  key="loading"
                  class="ios-spinner relative flex items-center justify-center size-4.5 sm:size-5"
                >
                  <svg
                    class="size-full animate-spin-smooth"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <!-- Background Track -->
                    <circle
                      cx="12"
                      cy="12"
                      r="9.5"
                      stroke="rgba(255, 255, 255, 0.12)"
                      stroke-width="2"
                    />
                    <!-- Animated Arc -->
                    <circle
                      cx="12"
                      cy="12"
                      r="9.5"
                      stroke="url(#iosEmeraldGradient)"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      stroke-dasharray="35 60"
                    />
                    <defs>
                      <linearGradient
                        id="iosEmeraldGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stop-color="#34D399"
                        />
                        <stop
                          offset="100%"
                          stop-color="#059669"
                        />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </Transition>
            </div>

            <!-- Label & Counter -->
            <div class="flex items-center gap-2 truncate">
              <span class="text-[13px] sm:text-sm font-medium tracking-tight text-neutral-100">
                {{ isFinished ? 'Tekshirildi' : 'Tekshirilmoqda' }}
              </span>

              <!-- iOS Badge / Capsule Counter -->
              <span
                class="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-white/[0.08] dark:bg-white/[0.1] border border-white/[0.12] text-[11px] font-mono font-semibold tracking-tight text-emerald-400 dark:text-emerald-300 shadow-sm"
              >
                {{ progress.completed }} / {{ progress.total }}
              </span>
            </div>
          </div>

          <!-- Right Percentage Display -->
          <div class="shrink-0 text-right">
            <span class="text-[12px] sm:text-[13px] font-mono font-bold tracking-tight text-neutral-300 tabular-nums">
              {{ percentage }}%
            </span>
          </div>
        </div>

        <!-- Sleek Apple-Style Thin Progress Track -->
        <div class="relative w-full h-[3px] sm:h-[3.5px] bg-white/[0.1] rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 rounded-full transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-[0_0_8px_rgba(52,211,153,0.7)]"
            :style="{ width: `${percentage}%` }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ios-live-pill {
  background: rgba(18, 18, 20, 0.82);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow:
    0 16px 40px -8px rgba(0, 0, 0, 0.65),
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 1px 0 0 rgba(255, 255, 255, 0.2) inset,
    0 0 24px -4px rgba(16, 185, 129, 0.15);
}

@keyframes iosSpin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.animate-spin-smooth {
  animation: iosSpin 0.95s linear infinite;
  transform-origin: center;
}
</style>
