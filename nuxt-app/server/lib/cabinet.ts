/**
 * lib/cabinet.ts
 *
 * Manages CRM student cache, synchronization, and individual/bulk refreshes.
 */

import db from './turso'
import { checkStudentVisaStatus } from './visa'

export interface Student {
  passport: string
  fullName: string
  birthday: string
  studentId: string
  status: string
  applicationDate: string
  lastChecked: string
  rejectReason: string
  pdfUrl: string
  userId: number
  visaType: string
  applicationNo: string
  telegram_user_id: number | null
  apiResponse?: string
}

export interface DatabaseStudentRow {
  passport: string
  fullName?: string
  fullname?: string
  birthday?: string
  studentId?: string
  student_id?: string
  status?: string
  applicationDate?: string
  application_date?: string
  lastChecked?: string
  last_checked?: string
  rejectReason?: string
  pdfUrl?: string
  userId: number
  visaType?: string
  visa_type?: string
  applicationNo?: string
  application_no?: string
  telegram_user_id?: number | null
  apiResponse?: string
  api_response?: string
  uId?: number
}

interface ParsedApiResponse {
  invitingCompany?: string
  entryDate?: string
  statusOfResidence?: string
  visaKind?: string
  previousRejectionReason?: string
}

export function normalizeStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) {
    return 'pending'
  }
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued') || s.includes('tasdiqlangan') || s.includes('ishlatilgan') || s.includes('허가') || s.includes('발급') || s.includes('사용완료')) {
    return 'approved'
  }
  if (s.includes('cancel') || s.includes('reject') || s.includes('bekor') || s.includes('rad') || s.includes('불허') || s.includes('취소') || s.includes('반려') || s.includes('returned')) {
    return 'cancelled'
  }
  if (s.includes('supplement submitted') || s.includes('supplement completed') || s.includes('보완완료') || s.includes('보완제출') || s.includes('보완접수')) {
    return 'supplement submitted'
  }
  if (s.includes('pending supplement') || s.includes('supplement') || s.includes('보완대기') || s.includes('보완') || s.includes('qo\'shimcha') || s.includes('asking')) {
    return 'supplement needed'
  }
  if (s.includes('received') || s.includes('app/') || s.includes('qabul') || s.includes('접수') || s.includes('신청')) {
    return 'received'
  }
  if (s.includes('under review') || s.includes('ko\'rib') || s.includes('tayyorlanish') || s.includes('심사중') || s.includes('심사 중') || s.includes('처리중') || s.includes('처리 중')) {
    return 'under review'
  }
  return s
}

export function isSameStatus(status1: string, status2: string): boolean {
  return normalizeStatus(status1) === normalizeStatus(status2)
}

export function getStatusEmoji(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued') || normalized.includes('허가') || normalized.includes('발급')) {
    return '🟢'
  }
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('불허') || normalized.includes('취소')) {
    return '🔴'
  }
  if (normalized.includes('supplement submitted') || normalized.includes('supplement completed') || normalized.includes('보완완료') || normalized.includes('보완제출') || normalized.includes('보완접수')) {
    return '📝'
  }
  if (normalized.includes('supplement') || normalized.includes('보완') || normalized.includes('qo\'shimcha') || normalized.includes('asking')) {
    return '⚠️'
  }
  if (normalized.includes('received') || normalized.includes('app/') || normalized.includes('접수') || normalized.includes('신청')) {
    return '🟠'
  }
  if (normalized.includes('under review') || normalized.includes('심사중') || normalized.includes('심사 중') || normalized.includes('처리중') || normalized.includes('처리 중')) {
    return '🔵'
  }
  return '🔷'
}

export function getStatusDescription(status: string, lang: 'uz' | 'en' = 'uz'): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued') || normalized.includes('허가') || normalized.includes('발급')) {
    return lang === 'en' ? 'Congratulations 🎉' : 'Tabriklaymiz 🎉'
  }
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('불허') || normalized.includes('취소')) {
    return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.'
  }
  if (normalized.includes('supplement submitted') || normalized.includes('supplement completed') || normalized.includes('보완완료') || normalized.includes('보완제출') || normalized.includes('보완접수')) {
    return lang === 'en' ? '📝 Supplementary documents have been submitted and are under review.' : '📝 Qo\'shimcha hujjatlar topshirildi va ko\'rib chiqilmoqda.'
  }
  if (normalized.includes('supplement') || normalized.includes('보완') || normalized.includes('qo\'shimcha') || normalized.includes('asking')) {
    return lang === 'en' ? '⚠️ Additional documents required (Supplement Needed).' : '⚠️ Qo\'shimcha hujjatlar talab qilinmoqda (Qo\'shimcha hujjat kerak).'
  }
  if (normalized.includes('received') || normalized.includes('app/') || normalized.includes('접수') || normalized.includes('신청')) {
    return lang === 'en' ? '⏳ Your application is being processed.' : '⏳ Arizangiz jarayonda.'
  }
  if (normalized.includes('under review') || normalized.includes('심사중') || normalized.includes('심사 중') || normalized.includes('처리중') || normalized.includes('처리 중')) {
    return lang === 'en' ? '🔎 Under review.' : '🔎 Ko\'rib chiqilmoqda.'
  }
  return lang === 'en' ? 'Status updated.' : 'Status yangilandi.'
}

/**
 * Formats a Telegram student card message.
 */
export function formatLastChecked(dateString: string, lang: 'uz' | 'en' = 'uz'): string {
  const today = lang === 'en' ? 'Today' : 'Bugun'
  const never = lang === 'en' ? 'Never' : 'Hech qachon'
  if (!dateString) return never
  const date = new Date(dateString)
  try {
    const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' })
    const dateStr = date.toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' })

    const timePart = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    if (todayStr === dateStr) {
      return `${today}, ${timePart}`
    } else {
      const datePart = date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Tashkent',
        month: 'short',
        day: 'numeric'
      })
      return `${datePart}, ${timePart}`
    }
  } catch {
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
    const uzDate = new Date(utc + (3600000 * 5))
    let hours = uzDate.getHours()
    const minutes = String(uzDate.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    const timePart = `${hours}:${minutes} ${ampm}`

    const nowUz = new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60000) + (3600000 * 5))
    if (nowUz.toDateString() === uzDate.toDateString()) {
      return `${today}, ${timePart}`
    } else {
      return `${uzDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timePart}`
    }
  }
}

export function cleanVisaTypeCode(raw: string): string {
  if (!raw) return ''
  const str = String(raw).trim()
  const match = str.match(/([A-Z]-\d+(?:-\d+)?)/i)
  if (match && match[1]) {
    return match[1].toUpperCase()
  }
  return str
}

export function formatStatusDisplay(status: string): string {
  const norm = normalizeStatus(status)
  if (norm === 'approved') return 'APPROVED'
  if (norm === 'cancelled') return 'REJECTED'
  if (norm === 'supplement submitted') return 'SUPPLEMENT SUBMITTED'
  if (norm === 'supplement needed') return 'SUPPLEMENT NEEDED'
  if (norm === 'received') return 'RECEIVED'
  if (norm === 'under review') return 'UNDER REVIEW'
  if (norm === 'pending') return 'PENDING'
  return (status || 'PENDING').toUpperCase()
}

/**
 * Formats a Telegram student card message.
 */
export function formatStudentCard(student: Student, _isUpdate: boolean = false, _oldStatus: string = '', lang: 'uz' | 'en' = 'uz'): string {
  const emoji = getStatusEmoji(student.status)
  const checkedStr = formatLastChecked(student.lastChecked, lang)
  const desc = getStatusDescription(student.status, lang)

  let parsedApi: ParsedApiResponse = {}
  try {
    parsedApi = JSON.parse(student.apiResponse || '{}') as ParsedApiResponse
  } catch {
    // Ignore parsing errors
  }

  const partner = parsedApi.invitingCompany || ''
  const rawGivenDate = parsedApi.entryDate || ''
  const isApproved = ['APPROVED', 'USED', 'ISSUED'].some(s => (student.status || '').toUpperCase().includes(s))
  const visaGivenDate = (isApproved && rawGivenDate && rawGivenDate !== student.applicationDate) ? rawGivenDate : ''

  const rawResidence = cleanVisaTypeCode(parsedApi.statusOfResidence || parsedApi.visaKind || '')
  const rawTypeClean = cleanVisaTypeCode(student.visaType || '')

  let displayVisaType = 'Embassy'
  if (rawResidence) {
    displayVisaType = rawResidence
  } else if (rawTypeClean && !['EMBASSY', 'E-VISA', 'REGIONAL'].includes(rawTypeClean.toUpperCase())) {
    displayVisaType = rawTypeClean
  } else if (student.visaType) {
    displayVisaType = student.visaType
  }

  const isEVisaOrRegional = student.visaType === 'E-Visa' || student.visaType === 'Regional'
  const prevReason = parsedApi.previousRejectionReason || ''

  const labels = {
    title: lang === 'en' ? '🔍 Visa Status Check' : '🔍 Visa statusini tekshirish',
    visaLbl: lang === 'en' ? '✈️ Visa type:' : '✈️ Visa turi:',
    partner: lang === 'en' ? '🏢 Partner:' : '🏢 Taklif:',
    appNo: lang === 'en' ? '📄 Application No:' : '📄 Ariza raqami:',
    submitted: lang === 'en' ? '📅 Submitted date:' : '📅 Topshirilgan sana:',
    status: lang === 'en' ? '🔄 Status:' : '🔄 Holati:',
    givenDate: lang === 'en' ? '🗓️ Visa given date:' : '🗓️ Viza berilgan sana:',
    checked: lang === 'en' ? '🕒 Checked:' : '🕒 Tekshirildi:',
    result: lang === 'en' ? 'Result:' : 'Natija:',
    reason: lang === 'en' ? '⚠️ Reason:' : '⚠️ Sababi:',
    prevResult: lang === 'en' ? 'Previous application result:\n🚫 Reason:' : 'Bundan oldingi ariza natijasi:\n🚫 Sababi:',
    na: lang === 'en' ? 'N/A' : 'Yo\'q'
  }

  const header = labels.title

  const lines = [
    header,
    ``,
    `👤 ${student.fullName.toUpperCase()}`,
    `🛂 ${student.passport.toUpperCase()}`,
    `🎂 ${student.birthday}`,
    ``,
    `${labels.visaLbl} ${displayVisaType}`,
    ...(isEVisaOrRegional && partner ? [`${labels.partner} ${partner}`] : []),
    ...(isEVisaOrRegional && student.applicationNo ? [`${labels.appNo} ${student.applicationNo}`] : []),
    `${labels.submitted} ${student.applicationDate || labels.na}`,
    `${labels.status} ${emoji} ${formatStatusDisplay(student.status)}`,
    ...(visaGivenDate ? [`${labels.givenDate} ${visaGivenDate}`] : []),
    ``,
    `${labels.checked} ${checkedStr}`,
    ``,
    `${labels.result} ${desc}`,
    ...(student.rejectReason ? [`${labels.reason} ${student.rejectReason}`] : []),
    ...(prevReason ? [`\n${labels.prevResult} ${prevReason}`] : [])
  ]

  return lines.join('\n')
}

/**
 * Fetches all active (non-deleted) students belonging to a connected Telegram user.
 */
export async function getStudentsByTelegramId(telegramId: number): Promise<Student[]> {
  try {
    const result = await db.execute({
      sql: `
                SELECT s.* FROM students s
                JOIN cabinet_subscribers cs ON s.userId = cs.cabinet_id
                WHERE cs.telegram_id = ? AND s.deletedAt IS NULL
                ORDER BY s.createdAt DESC
            `,
      args: [telegramId]
    })

    return (result.rows as unknown as DatabaseStudentRow[]).map(row => ({
      passport: row.passport,
      fullName: row.fullName || row.fullname || '',
      birthday: row.birthday || '',
      studentId: row.studentId || row.student_id || '',
      status: row.status || 'Pending',
      applicationDate: row.applicationDate || row.application_date || '',
      lastChecked: row.lastChecked || row.last_checked || '',
      rejectReason: row.rejectReason || '',
      pdfUrl: row.pdfUrl || '',
      userId: Number(row.userId),
      visaType: row.visaType || row.visa_type || 'Embassy',
      applicationNo: row.applicationNo || row.application_no || '',
      telegram_user_id: row.telegram_user_id ? Number(row.telegram_user_id) : null,
      apiResponse: row.apiResponse || row.api_response || '{}'
    }))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Cabinet Service] Error fetching students:', message)
    return []
  }
}

/**
 * Checks and updates a student's status, and logs a notification if it changes.
 * Returns { changed: boolean, oldStatus: string, student: Student }
 */
export async function refreshStudent(telegramId: number, passport: string): Promise<{
  success: boolean
  changed: boolean
  oldStatus: string
  student?: Student
  error?: string
}> {
  try {
    // 1. Fetch student — resolve cabinet via cabinet_subscribers so any
    //    subscriber of the same cabinet can refresh any of its students.
    const result = await db.execute({
      sql: `
                SELECT s.*, cs.cabinet_id as uId
                FROM students s
                JOIN cabinet_subscribers cs ON s.userId = cs.cabinet_id
                WHERE s.passport = ? AND cs.telegram_id = ? AND s.deletedAt IS NULL
            `,
      args: [passport.toUpperCase().trim(), telegramId]
    })

    if (result.rows.length === 0) {
      return { success: false, changed: false, oldStatus: '', error: 'Student not found in your cabinet.' }
    }

    const row = result.rows[0] as unknown as DatabaseStudentRow
    const student: Student = {
      passport: row.passport,
      fullName: row.fullName || row.fullname || '',
      birthday: row.birthday || '',
      studentId: row.studentId || row.student_id || '',
      status: row.status || 'Pending',
      applicationDate: row.applicationDate || row.application_date || '',
      lastChecked: row.lastChecked || row.last_checked || '',
      rejectReason: row.rejectReason || '',
      pdfUrl: row.pdfUrl || '',
      userId: Number(row.uId),
      visaType: row.visaType || row.visa_type || 'Embassy',
      applicationNo: row.applicationNo || row.application_no || '',
      telegram_user_id: telegramId,
      apiResponse: row.apiResponse || row.api_response || '{}'
    }

    // 2. Query official visa portal
    const liveStatus = await checkStudentVisaStatus(
      student.passport,
      student.fullName,
      student.birthday,
      student.visaType,
      student.applicationNo
    )

    if (!liveStatus.found) {
      // Update last checked time even if not found on the portal (e.g. pending submission)
      const now = new Date().toISOString()
      await db.execute({
        sql: 'UPDATE students SET lastChecked = ?, last_checked = ?, check_source = \'manual\', checkSource = \'manual\' WHERE passport = ?',
        args: [now, now, student.passport]
      })
      student.lastChecked = now
      return { success: true, changed: false, oldStatus: student.status, student }
    }

    const oldStatus = student.status
    const newStatus = liveStatus.latestStatus
    const changed = !isSameStatus(oldStatus, newStatus)
    const now = new Date().toISOString()

    // 3. Update student in database (keeping both camelCase and snake_case in sync)
    await db.execute({
      sql: `
                UPDATE students 
                SET status = ?,
                    applicationDate = ?,
                    application_date = ?,
                    lastChecked = ?,
                    last_checked = ?,
                    rejectReason = ?,
                    pdfUrl = ?,
                    apiResponse = ?,
                    check_source = 'manual',
                    checkSource = 'manual'
                WHERE passport = ? AND deletedAt IS NULL
            `,
      args: [
        newStatus,
        liveStatus.latestDate || student.applicationDate,
        liveStatus.latestDate || student.applicationDate,
        now,
        now,
        liveStatus.rejectionReason || '',
        liveStatus.pdfUrl || '',
        JSON.stringify(liveStatus),
        student.passport
      ]
    })

    if (telegramId) {
      await db.execute({
        sql: 'UPDATE students SET telegram_user_id = ? WHERE passport = ?',
        args: [telegramId, student.passport]
      })
    }

    // Update local object
    student.status = newStatus
    student.applicationDate = liveStatus.latestDate || student.applicationDate
    student.lastChecked = now
    student.rejectReason = liveStatus.rejectionReason || ''
    student.pdfUrl = liveStatus.pdfUrl || ''
    student.apiResponse = JSON.stringify(liveStatus)

    // Publish realtime update to all consultings holding this passport
    const updatedChanges = {
      status: newStatus,
      applicationDate: student.applicationDate,
      lastChecked: now,
      rejectReason: student.rejectReason,
      pdfUrl: student.pdfUrl,
      apiResponse: student.apiResponse,
      check_source: 'manual',
      checkSource: 'manual'
    }

    try {
      const userRowsRes = await db.execute({
        sql: 'SELECT DISTINCT userId FROM students WHERE passport = ? AND deletedAt IS NULL',
        args: [student.passport]
      })
      for (const row of userRowsRes.rows) {
        const uid = Number((row as Record<string, unknown>).userId)
        if (uid && !isNaN(uid)) {
          await publishRealtime(uid, {
            type: 'student.updated',
            eventId: crypto.randomUUID(),
            updatedAt: now,
            originClientId: `cabinet-${student.passport}`,
            passport: student.passport,
            changes: updatedChanges
          }).catch(() => {})
        }
      }
    } catch (rErr) {
      console.error('[Cabinet Service] Realtime publish failed:', rErr)
    }

    // 4. Log notification if status changed
    if (changed) {
      await db.execute({
        sql: `
                    INSERT INTO notifications (telegram_user_id, student_id, old_status, new_status, created_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                `,
        args: [telegramId || null, student.passport, oldStatus, newStatus]
      })
    }

    return { success: true, changed, oldStatus, student }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Cabinet Service] Error refreshing student ${passport}:`, message)
    return { success: false, changed: false, oldStatus: '', error: message }
  }
}
