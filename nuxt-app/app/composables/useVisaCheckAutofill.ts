import type { VisaType } from '~/types/visa-check'
import { PASSPORT_REGEX } from '~/utils/validation'

/**
 * Live-typing passport autofill for the public visa checker: looks up any
 * existing cached record for the typed passport and fills name/DOB/visa-type
 * — but only into fields the visitor hasn't already edited themselves.
 * Mirrors visa-status.html's autofillFromDb().
 */
export function useVisaCheckAutofill(onAutofill: (fields: { fullName?: string, birthday?: string, visaType?: VisaType }) => void) {
  const { lookupPublic } = useVisaCheckService()
  const isLoading = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastChecked = ''

  async function runAutofill(passport: string) {
    isLoading.value = true
    try {
      const rows = await lookupPublic(passport)
      const match = rows?.[0]
      if (!match) return
      lastChecked = passport

      const fields: { fullName?: string, birthday?: string, visaType?: VisaType } = {}
      if (match.fullName) fields.fullName = match.fullName
      if (match.birthday) fields.birthday = match.birthday
      if (match.visaType === 'Embassy' || match.visaType === 'E-Visa') fields.visaType = match.visaType
      onAutofill(fields)
    } catch {
      /* silently ignore network errors, matching legacy behavior */
    } finally {
      isLoading.value = false
    }
  }

  function onPassportInput(rawPassport: string) {
    if (debounceTimer) clearTimeout(debounceTimer)
    const passport = rawPassport.trim().toUpperCase()
    if (!PASSPORT_REGEX.test(passport)) {
      lastChecked = ''
      return
    }
    if (passport === lastChecked) return
    debounceTimer = setTimeout(() => runAutofill(passport), 600)
  }

  return { isLoading, onPassportInput }
}
