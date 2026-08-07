export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) {
    window.addEventListener(
      'toast.viewportPause',
      (e) => {
        e.stopPropagation()
      },
      true
    )
    window.addEventListener(
      'toast.viewportResume',
      (e) => {
        e.stopPropagation()
      },
      true
    )
  }
})
