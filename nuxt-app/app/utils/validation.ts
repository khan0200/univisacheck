export const PASSPORT_REGEX = /^[A-Z]{2}\d{7}$/
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
export const MIN_BIRTH_YEAR = 1940

export function formatPassportInput(raw: string): string {
  const value = raw.toUpperCase()
  const letters = value.slice(0, 2).replace(/[^A-Z]/g, '')
  const digits = value.slice(2).replace(/\D/g, '').slice(0, 7)
  return letters + digits
}

/** Auto-inserts dashes as the user types digits into a YYYY-MM-DD field. */
export function formatDateInput(raw: string): string {
  let value = raw.replace(/\D/g, '')
  if (value.length > 8) value = value.slice(0, 8)
  if (value.length > 4) value = `${value.slice(0, 4)}-${value.slice(4)}`
  if (value.length > 7) value = `${value.slice(0, 7)}-${value.slice(7)}`
  return value
}

export function validatePassport(passport: string): string | null {
  if (!PASSPORT_REGEX.test(passport)) {
    return 'Passport format must be 2 letters followed by 7 digits (e.g., AA1234567)'
  }
  return null
}

export function validateBirthday(birthday: string): string | null {
  if (!DATE_REGEX.test(birthday)) {
    return 'Birthday must be in YYYY-MM-DD format (e.g., 2005-01-30)'
  }
  const birthDate = new Date(birthday)
  const today = new Date()
  const minDate = new Date(MIN_BIRTH_YEAR, 0, 1)

  if (birthDate > today) return 'Birthday cannot be in the future'
  if (birthDate < minDate) return `Birthday cannot be before ${MIN_BIRTH_YEAR}`
  return null
}
