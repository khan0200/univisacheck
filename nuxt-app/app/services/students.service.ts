import type { Student, StudentFormInput, VisaCheckResult } from '~/types/student'

const STUDENTS_URL = '/api/students'
const CHECK_STATUS_URL = '/api/check-status'

export function useStudentsService() {
  const { apiFetch } = useApiFetch()

  function list() {
    return apiFetch<Student[]>(STUDENTS_URL)
  }

  /** Public, unauthenticated passport lookup — used for duplicate/autofill checks in the Add form. */
  function lookupPublic(passport: string) {
    return apiFetch<Student[]>(`${STUDENTS_URL}?passport=${encodeURIComponent(passport)}&public=true`)
  }

  function save(payload: StudentFormInput & { status?: string, lastChecked?: string }) {
    return apiFetch<Student>(STUDENTS_URL, {
      method: 'POST',
      body: payload
    })
  }

  function updateFields(payload: Partial<Student> & { passport: string }) {
    return apiFetch<Student>(STUDENTS_URL, {
      method: 'POST',
      body: payload
    })
  }

  function setBatchSelected(passport: string | string[], batchSelected: boolean) {
    const body = Array.isArray(passport)
      ? { passports: passport, batchSelected, batchSelectedUpdatedAt: true }
      : { passport, batchSelected, batchSelectedUpdatedAt: true }
    return apiFetch<{ success: boolean }>(STUDENTS_URL, {
      method: 'PATCH',
      body
    })
  }

  function togglePin(passport: string, pinned: boolean) {
    return apiFetch<{ success: boolean }>(STUDENTS_URL, {
      method: 'PATCH',
      body: { passport, pinned }
    })
  }

  function remove(passport: string) {
    return apiFetch<{ success: boolean }>(`${STUDENTS_URL}?passport=${encodeURIComponent(passport)}`, {
      method: 'DELETE'
    })
  }

  function removeMany(passports: string[]) {
    return apiFetch<{ success: boolean }>(`${STUDENTS_URL}?passport=${encodeURIComponent(passports.join(','))}`, {
      method: 'DELETE'
    })
  }

  function checkStatus(student: Pick<Student, 'passport' | 'fullName' | 'birthday' | 'visaType' | 'applicationNo'>) {
    return apiFetch<VisaCheckResult>(CHECK_STATUS_URL, {
      method: 'POST',
      body: {
        passport_number: student.passport,
        english_name: student.fullName,
        birth_date: student.birthday,
        visa_type: student.visaType || 'Embassy',
        application_no: student.applicationNo || ''
      }
    })
  }

  function downloadPdfUrl(student: Pick<Student, 'passport' | 'fullName' | 'birthday' | 'pdfUrl' | 'visaType' | 'applicationNo'>) {
    const params = new URLSearchParams({
      url: student.pdfUrl || '',
      passport: student.passport,
      full_name: student.fullName || '',
      birth_date: student.birthday || '',
      visa_type: student.visaType || '',
      application_no: student.applicationNo || ''
    })
    return `/api/download-visa-pdf?${params.toString()}`
  }

  return {
    list,
    lookupPublic,
    save,
    updateFields,
    setBatchSelected,
    togglePin,
    remove,
    removeMany,
    checkStatus,
    downloadPdfUrl
  }
}
