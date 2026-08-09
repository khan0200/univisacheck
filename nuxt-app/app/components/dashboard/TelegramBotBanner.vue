<template>
  <div class="flex flex-col sm:flex-row items-center gap-4 rounded-xl px-5 py-4 bg-gradient-to-r from-primary-900 to-primary-700 text-white">
    <div class="flex items-center justify-center size-11 shrink-0 rounded-xl bg-white/10">
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        class="size-6"
      ><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" /></svg>
    </div>
    <div class="flex-1 text-center sm:text-left">
      <p class="font-semibold text-sm">
        Track via Telegram Bot
      </p>
      <p class="text-xs text-white/75 mt-0.5">
        Check students' visa status directly in Telegram and get instant notifications about changes.
      </p>
    </div>
    <UButton
      to="https://t.me/Koreavizabot"
      target="_blank"
      trailing-icon="i-lucide-arrow-right"
      color="secondary"
      class="shrink-0 bg-secondary-600 hover:bg-secondary-700 active:bg-secondary-700 text-primary-950"
    >
      Open Bot
    </UButton>
  </div>
</template>
