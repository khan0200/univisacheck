<template>
  <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)] shadow-sm px-6 py-10 text-center">
    <div class="flex items-center justify-center size-14 rounded-full bg-neutral-100 dark:bg-white/5 border border-[var(--color-border)] dark:border-white/[0.08] mx-auto mb-4">
      <UIcon
        name="i-lucide-search"
        class="size-6 text-[var(--color-text-secondary)]"
      />
    </div>
    <p class="font-bold text-[var(--color-text-primary)] dark:text-white mb-1.5">
      No Record Found
    </p>
    <p class="text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed">
      No visa application was found for this passport.<br>
      Please double-check your details and try again.
    </p>
  </div>
</template>
