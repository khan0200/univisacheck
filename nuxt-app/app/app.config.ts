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
        root: 'relative group overflow-hidden shadow-xl rounded-xl p-4 flex gap-3 border transition-all duration-200',
        title: 'text-sm font-bold',
        description: 'text-xs opacity-90',
        icon: 'shrink-0 size-5',
        progress: 'absolute inset-x-0 bottom-0 h-1'
      },
      variants: {
        color: {
          primary: {
            root: 'bg-primary-900 text-white border-secondary-500/40 shadow-primary-950/40',
            title: 'text-white font-bold',
            description: 'text-primary-100',
            icon: 'text-secondary-400',
            close: 'text-primary-200 hover:text-white',
            progress: 'bg-secondary-400'
          },
          secondary: {
            root: 'bg-secondary-900 text-white border-secondary-500/60 shadow-secondary-950/40',
            title: 'text-secondary-100 font-bold',
            description: 'text-secondary-200/90',
            icon: 'text-secondary-300',
            close: 'text-secondary-300 hover:text-white',
            progress: 'bg-secondary-400'
          },
          error: {
            root: 'bg-danger-900 text-white border-danger-700/50 shadow-danger-950/30',
            title: 'text-white font-bold',
            description: 'text-danger-100',
            icon: 'text-danger-400',
            close: 'text-danger-200 hover:text-white',
            progress: 'bg-danger-400'
          }
        }
      }
    }
  }
})
