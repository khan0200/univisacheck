<template>
  <Transition name="vpn-slide">
    <div
      v-if="activeNotification"
      class="vpn-banner"
      role="region"
      aria-label="Viza berish bildirishnomasi"
    >
      <div class="vpn-banner__content">
        <span class="vpn-banner__icon">📢</span>
        <span class="vpn-banner__text">{{ activeNotification.message }}</span>
      </div>

      <button
        type="button"
        class="vpn-banner__close shrink-0"
        :class="{ 'is-dismissing': activeNotification?.isDismissing }"
        :title="activeNotification?.isDismissing ? `${activeNotification.countdown} soniyada yopiladi` : 'Yopish'"
        aria-label="Yopish"
        @click="dismiss()"
      >
        <span
          v-if="activeNotification?.isDismissing"
          class="text-[0.75rem] font-mono font-semibold px-0.5"
        >
          {{ activeNotification.countdown }}s
        </span>
        <span v-else>×</span>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useProcessingNotifications } from '../../composables/useProcessingNotifications'

const { activeNotification, dismiss } = useProcessingNotifications()
</script>

<style scoped>
.vpn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12));
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 0.75rem;
  color: #f8fafc;
  margin-bottom: 1rem;
  backdrop-filter: blur(8px);
}

.vpn-banner__content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 500;
}

.vpn-banner__icon {
  font-size: 1.125rem;
}

.vpn-banner__text {
  color: #e2e8f0;
}

.vpn-banner__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border: none;
  font-size: 1.125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.vpn-banner__close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.vpn-banner__close.is-dismissing {
  width: auto;
  min-width: 1.75rem;
  padding: 0 0.375rem;
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.vpn-slide-enter-active,
.vpn-slide-leave-active {
  transition: all 0.3s ease;
}

.vpn-slide-enter-from,
.vpn-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
