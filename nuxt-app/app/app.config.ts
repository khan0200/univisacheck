export default defineAppConfig({
  ui: {
    icons: {
      arrowLeft: 'i-lucide-arrow-left',
      arrowRight: 'i-lucide-arrow-right',
      check: 'i-lucide-check',
      chevronDoubleLeft: 'i-lucide-chevrons-left',
      chevronDoubleRight: 'i-lucide-chevrons-right',
      chevronDown: 'i-lucide-chevron-down',
      chevronLeft: 'i-lucide-chevron-left',
      chevronRight: 'i-lucide-chevron-right',
      chevronUp: 'i-lucide-chevron-up',
      close: 'i-lucide-x',
      ellipsis: 'i-lucide-ellipsis',
      external: 'i-lucide-external-link',
      loading: 'i-lucide-loader-circle',
      minus: 'i-lucide-minus',
      plus: 'i-lucide-plus',
      search: 'i-lucide-search'
    },
    colors: {
      primary: 'primary',
      secondary: 'secondary',
      neutral: 'slate',
      success: 'success',
      warning: 'warning',
      error: 'danger'
    },
    button: {
      slots: {
        base: 'font-medium rounded-sm transition-all duration-150 ease-out'
      }
    },
    card: {
      slots: {
        root: 'rounded-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'
      }
    },
    badge: {
      slots: {
        base: 'rounded-sm'
      }
    },
    modal: {
      slots: {
        content: 'rounded-2xl'
      }
    },
    input: {
      slots: {
        base: 'rounded-md'
      }
    },
    select: {
      slots: {
        base: 'rounded-md'
      }
    },
    dropdownMenu: {
      slots: {
        content: 'rounded-md'
      }
    },
    toast: {
      slots: {
        root: 'rounded-xl shadow-lg border border-[var(--color-border)] dark:border-white/10'
      }
    },
    toaster: {
      duration: 2500
    }
  }
})
