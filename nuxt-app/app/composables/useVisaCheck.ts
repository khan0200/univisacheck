import type { Student } from '~/types/student'
import { applyVisaCheckResult, normalizeStatusForComparison } from '~/utils/visa-status'

/**
 * Checks live visa status for one student, persists the result, and fires a
 * Telegram notification only when the status bucket actually changed —
 * mirrors the legacy app.js checkVisaStatus()/sendTelegramNotification() pair.
 */
export function useVisaCheck() {
  const { checkStatus, updateFields, notifyTelegram } = useStudentsService()
  const checkingPassports = ref(new Set<string>())

  async function checkOne(student: Student): Promise<boolean> {
    checkingPassports.value.add(student.passport)
    try {
      const result = await checkStatus(student)
      const { changed, oldStatus, newStatus } = applyVisaCheckResult(student, result)

      await updateFields({
        passport: student.passport,
        fullName: student.fullName,
        birthday: student.birthday,
        status: student.status,
        applicationDate: student.applicationDate,
        rejectReason: student.rejectReason,
        pdfUrl: student.pdfUrl,
        apiResponse: JSON.stringify(student.apiResponse),
        lastChecked: student.lastChecked,
        visaType: student.visaType || 'Embassy',
        applicationNo: student.applicationNo || ''
      })

      if (changed) {
        const apiResponse = typeof student.apiResponse === 'object' ? student.apiResponse : null
        await notifyTelegram({
          fullName: student.fullName || '',
          passport: student.passport || '',
          studentId: student.studentId || '',
          visaType: student.visaType || 'Embassy',
          applicationNo: student.applicationNo || '',
          birthday: student.birthday || '',
          oldStatus,
          newStatus,
          applicationDate: student.applicationDate || '',
          rejectionReason: student.rejectReason || '',
          pdfUrl: student.pdfUrl || '',
          previousRejectionReason: apiResponse?.previousRejectionReason || '',
          invitingCompany: apiResponse?.invitingCompany || '',
          entryDate: apiResponse?.entryDate || '',
          changedAt: new Date().toISOString()
        }).catch(() => {})
      }

      return changed
    } finally {
      checkingPassports.value.delete(student.passport)
    }
  }

  async function checkMany(list: Student[], concurrency = 3) {
    let index = 0
    const changes: { student: Student; oldStatus: string; newStatus: string }[] = []
    
    async function worker() {
      while (index < list.length) {
        const student = list[index++]!
        const oldStatus = student.status || 'Pending'
        await checkOne(student)
          .then(changed => {
            if (changed) {
              changes.push({
                student,
                oldStatus,
                newStatus: student.status || 'Unknown'
              })
            }
          })
          .catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))
    return changes
  }

  return { checkOne, checkMany, checkingPassports, normalizeStatusForComparison }
}
