import { ref, nextTick, inject } from 'vue'

export const toastMaxInjectionKey = Symbol('nuxt-ui.toast-max')

export interface ToastItem {
  id: string
  open?: boolean
  duration?: number
  title?: string | (() => unknown) | unknown
  description?: string | (() => unknown) | unknown
  icon?: string
  avatar?: Record<string, unknown>
  color?: string
  orientation?: 'horizontal' | 'vertical'
  close?: boolean | Record<string, unknown>
  closeIcon?: string
  actions?: Array<Record<string, unknown>>
  progress?: boolean | Record<string, unknown>
  class?: unknown
  ui?: Record<string, unknown>
  onClick?: (toast: ToastItem) => void
  _duplicate?: number
  _updated?: boolean
  [key: string]: unknown
}

export type ToastInput = Partial<Omit<ToastItem, 'id'>> & { id?: string }

// Map of unpauseable JS timers for guaranteed 3-second auto-dismissal
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEFAULT_TOAST_DURATION = 3000 // 3 seconds

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])
  const max = inject<{ value: number } | undefined>(toastMaxInjectionKey, void 0)
  const running = ref(false)
  const queue: ToastItem[] = []

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  function mergeDuplicate(index: number, toast: ToastItem) {
    if (!toasts.value[index]) return
    toasts.value[index] = {
      ...toasts.value[index],
      ...toast,
      _duplicate: (toasts.value[index]._duplicate || 0) + 1
    }
  }

  async function processQueue() {
    if (running.value || queue.length === 0) {
      return
    }
    running.value = true
    while (queue.length > 0) {
      await nextTick()
      const toast = queue.shift()
      if (!toast) continue

      const maxValue = max?.value ?? 5
      if (maxValue <= 0) {
        if (toasts.value.length) {
          toasts.value = []
        }
        continue
      }
      const existingIndex = toasts.value.findIndex(t => t.id === toast.id)
      if (existingIndex !== -1) {
        mergeDuplicate(existingIndex, toast)
        continue
      }
      toasts.value = [...toasts.value, toast].slice(-maxValue)
    }
    running.value = false
  }

  function remove(id: string) {
    // Clear the active timer
    if (activeTimers.has(id)) {
      clearTimeout(activeTimers.get(id))
      activeTimers.delete(id)
    }

    const index = toasts.value.findIndex(t => t.id === id)
    if (index !== -1 && toasts.value[index]?._updated) {
      return
    }
    if (index !== -1 && toasts.value[index]) {
      toasts.value[index] = {
        ...toasts.value[index],
        open: false
      }
    }
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 200)
  }

  function add(toast: ToastInput): ToastItem {
    const duration = typeof toast.duration === 'number' ? toast.duration : DEFAULT_TOAST_DURATION
    const id = toast.id || generateId()

    const body: ToastItem = {
      id,
      open: true,
      duration,
      ...toast
    }

    // Set an unpauseable background timer that guarantees the toast disappears after duration (e.g. 3s),
    // even if the user hovers over the toast or the window/viewport pauses.
    if (activeTimers.has(id)) {
      clearTimeout(activeTimers.get(id))
      activeTimers.delete(id)
    }

    if (duration > 0 && duration !== Number.POSITIVE_INFINITY) {
      const timer = setTimeout(() => {
        remove(id)
      }, duration)
      activeTimers.set(id, timer)
    }

    const existingIndex = toasts.value.findIndex(t => t.id === body.id)
    if (existingIndex !== -1) {
      mergeDuplicate(existingIndex, body)
      return body
    }
    queue.push(body)
    processQueue()
    return body
  }

  function update(id: string, toast: Partial<ToastItem>) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index !== -1 && toasts.value[index]) {
      const newDuration = typeof toast.duration === 'number' ? toast.duration : DEFAULT_TOAST_DURATION
      toasts.value[index] = {
        ...toasts.value[index],
        ...toast,
        duration: newDuration,
        open: true,
        _updated: true
      }

      // Reset auto-dismiss timer on update
      if (activeTimers.has(id)) {
        clearTimeout(activeTimers.get(id))
        activeTimers.delete(id)
      }
      if (newDuration > 0 && newDuration !== Number.POSITIVE_INFINITY) {
        const timer = setTimeout(() => {
          remove(id)
        }, newDuration)
        activeTimers.set(id, timer)
      }

      nextTick(() => {
        const i = toasts.value.findIndex(t => t.id === id)
        if (i !== -1 && toasts.value[i]?._updated) {
          toasts.value[i] = {
            ...toasts.value[i]!,
            _updated: void 0
          }
        }
      })
    }
  }

  function clear() {
    for (const timer of activeTimers.values()) {
      clearTimeout(timer)
    }
    activeTimers.clear()
    toasts.value = []
  }

  return {
    toasts,
    add,
    update,
    remove,
    clear
  }
}
