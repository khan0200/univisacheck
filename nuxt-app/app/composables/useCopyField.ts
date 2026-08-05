import { useClipboard } from '@vueuse/core'

export function useCopyField() {
  const { copy, copied } = useClipboard()
  const lastCopiedId = ref<string | null>(null)

  async function copyValue(value: string | undefined | null, id: string) {
    const text = String(value || '').trim()
    if (!text || text === '--') return
    await copy(text)
    lastCopiedId.value = id
    setTimeout(() => {
      if (lastCopiedId.value === id) lastCopiedId.value = null
    }, 900)
  }

  function isCopied(id: string) {
    return copied.value && lastCopiedId.value === id
  }

  return { copyValue, isCopied }
}
