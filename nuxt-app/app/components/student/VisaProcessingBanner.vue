<template>
  <Transition name="vpn-banner-fade">
    <div
      v-if="activeNotification"
      class="vpn-banner"
      role="status"
      aria-live="polite"
    >
      <span
        class="vpn-banner__icon"
        aria-hidden="true"
      >ⓘ</span>

      <!-- Main message -->
      <span class="vpn-banner__text truncate">
        {{ formattedMessage }}
      </span>

      <!-- Visa types badge if multiple or specified -->
      <span
        v-if="visaTypesLabel"
        class="vpn-banner__badge shrink-0"
        :title="`Viza turlari: ${activeNotification.visaTypes.join(', ')}`"
      >
        {{ visaTypesLabel }}
      </span>

      <!-- Small close button -->
      <button
        type="button"
        class="vpn-banner__close shrink-0"
        aria-label="Yopish"
        @click="dismiss"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { activeNotification, dismiss } = useProcessingNotifications()

/** Format applicationDate YYYY-MM-DD to Uzbek short date (e.g. 20-iyul). */
function formatDateUz(isoDate: string): string {
  const months: Record<string, string> = {
    '01': 'yanvar', '02': 'fevral', '03': 'mart', '04': 'aprel',
    '05': 'may', '06': 'iyun', '07': 'iyul', '08': 'avgust',
    '09': 'sentabr', '10': 'oktabr', '11': 'noyabr', '12': 'dekabr'
  }
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  const monthName = months[month] || month
  return `${parseInt(day, 10)}-${monthName}`
}

const formattedMessage = computed(() => {
  if (!activeNotification.value) return ''
  const dateStr = formatDateUz(activeNotification.value.applicationDate)
  return `Elchixona ${dateStr} kuni hujjat topshirganlarga viza berishni boshladi.`
})

const visaTypesLabel = computed(() => {
  const types = activeNotification.value?.visaTypes
  if (!types || types.length === 0) return ''
  return types.join(', ')
})
</script>

<style scoped>
/* ── Inline Toolbar Banner ────────────────────────────────────────────────── */
.vpn-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.75rem; /* 44px matching h-11 UButton height */
  padding: 0 0.75rem;
  background: rgba(16, 185, 129, 0.12); /* Subtle emerald bg matching UniVisa style */
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 0.75rem; /* rounded-xl */
  color: #10b981;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1;
  max-width: 32rem;
  min-width: 0;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

:deep(.dark) .vpn-banner {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.35);
  color: #34d399;
}

.vpn-banner__icon {
  font-size: 0.95rem;
  font-weight: 700;
  flex-shrink: 0;
  opacity: 0.9;
}

.vpn-banner__text {
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vpn-banner__badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 0.375rem;
  color: inherit;
  letter-spacing: 0.02em;
}

.vpn-banner__close {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
  margin-left: 0.1rem;
  opacity: 0.7;
  border-radius: 0.25rem;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.vpn-banner__close:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

/* ── Smooth Fade & Scale Transition ─────────────────────────────────────── */
.vpn-banner-fade-enter-active,
.vpn-banner-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.vpn-banner-fade-enter-from,
.vpn-banner-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
