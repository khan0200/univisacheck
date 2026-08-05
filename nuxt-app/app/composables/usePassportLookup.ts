import { PASSPORT_REGEX } from '~/utils/validation'

export type LookupStatus = 'checking' | 'duplicate' | 'found' | null

/**
 * Live passport lookup for the Add Student form: warns immediately if the
 * passport already exists in the consultant's own list, otherwise checks the
 * public endpoint and autofills name/birthday if another consultant already
 * has this passport on file. Mirrors app.js's handlePassportLookup/runPassportLookup.
 */
export function usePassportLookup() {
  const studentsStore = useStudentsStore()
  const { lookupPublic } = useStudentsService()

  const status = ref<LookupStatus>(null)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastChecked = ''

  function reset() {
    if (debounceTimer) clearTimeout(debounceTimer)
    status.value = null
    lastChecked = ''
  }

  async function runLookup(passport: string, onAutofill: (fullName?: string, birthday?: string) => void) {
    const ownDuplicate = studentsStore.students.find((s) => s.passport === passport)
    if (ownDuplicate) {
      lastChecked = passport
      status.value = 'duplicate'
      return
    }

    try {
      const rows = await lookupPublic(passport)
      lastChecked = passport
      if (!rows || rows.length === 0) {
        status.value = null
        return
      }
      const match = rows[0]!
      onAutofill(match.fullName, match.birthday)
      status.value = 'found'
    } catch {
      status.value = null
    }
  }

  function onPassportInput(rawPassport: string, isEditMode: boolean, onAutofill: (fullName?: string, birthday?: string) => void) {
    if (isEditMode) return
    if (debounceTimer) clearTimeout(debounceTimer)

    const passport = rawPassport.trim().toUpperCase()
    if (!PASSPORT_REGEX.test(passport)) {
      lastChecked = ''
      status.value = null
      return
    }
    if (passport === lastChecked) return

    status.value = 'checking'
    debounceTimer = setTimeout(() => runLookup(passport, onAutofill), 500)
  }

  return { status, onPassportInput, reset }
}
