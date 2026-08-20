export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    document.addEventListener(
      'toast.viewportPause',
      (e) => {
        e.stopImmediatePropagation()
        e.stopPropagation()
        e.preventDefault()
      },
      true
    )
  }
})
