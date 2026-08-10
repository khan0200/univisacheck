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
      error: 'danger',
      info: 'blue'
    },
    button: {
      slots: {
        base: 'font-medium rounded-sm transition-all duration-150 ease-out'
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'bg-primary-700 hover:bg-primary-800 focus-visible:bg-primary-800 disabled:bg-primary-700'
        }
      ]
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
      },
      variants: {
        size: {
          md: {
            base: 'px-3.5 py-2.5 text-sm gap-2'
          }
        }
      }
    },
    select: {
      slots: {
        base: 'rounded-md'
      },
      variants: {
        size: {
          md: {
            base: 'px-3.5 py-2.5 text-sm gap-2'
          }
        }
      }
    },
    textarea: {
      variants: {
        size: {
          md: {
            base: 'px-3.5 py-2.5 text-sm gap-2'
          }
        }
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
            root: 'bg-primary-900 text-white border-secondary-500/50 shadow-primary-950/40',
            title: 'text-secondary-300 font-bold',
            description: 'text-white/85',
            icon: 'text-secondary-400',
            close: 'text-secondary-300/80 hover:text-secondary-200',
            progress: 'bg-secondary-400'
          },
          secondary: {
            root: 'bg-primary-900 text-white border-secondary-500/30 shadow-primary-950/40',
            title: 'text-secondary-200 font-bold',
            description: 'text-white/70',
            icon: 'text-secondary-500/80',
            close: 'text-secondary-300/70 hover:text-secondary-200',
            progress: 'bg-secondary-500/60'
          },
          error: {
            root: 'bg-primary-900 text-white border-danger-500/50 shadow-primary-950/40',
            title: 'text-danger-300 font-bold',
            description: 'text-white/85',
            icon: 'text-danger-400',
            close: 'text-secondary-300/70 hover:text-secondary-200',
            progress: 'bg-danger-400'
          }
        }
      }
    }
  }
})
