<template>
  <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)] overflow-hidden shadow-sm">
    <div class="px-6 pt-7 pb-5 text-center flex flex-col items-center gap-3">
      <div class="size-13 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
      <div class="h-4 w-22 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
      <div class="h-4 w-3/5 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
    </div>
    <div class="grid grid-cols-2 gap-px bg-[var(--color-border)] dark:bg-white/[0.08] border-t border-[var(--color-border)] dark:border-white/[0.08]">
      <div v-for="i in 4" :key="i" class="bg-white dark:bg-[var(--color-card-dark)] px-5 py-3.5 flex flex-col gap-2">
        <div class="h-2.5 w-1/2 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
        <div class="h-3.5 w-3/4 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
      </div>
    </div>
  </div>
</template>
