/**
 * server/plugins/local-cron-scheduler.ts
 *
 * In-process auto-check scheduler for local development & standalone runtime.
 * Automatically checks eligible selected students every 10 minutes and logs
 * clear, real-time progress in the terminal.
 */

import { getTursoClient } from '../utils/turso'
import * as directVisaCheck from '../lib/direct-visa-check'
import { publishRealtime } from '../utils/realtime-publisher'
import { sendTelegramNotification } from '../utils/telegram-notifier'

/** Calculate calendar days elapsed since applicationDate (YYYY-MM-DD). */
function getDaysSinceApplication(appDateStr: string): number {
  if (!appDateStr) return 0
  const match = appDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match || !match[1] || !match[2] || !match[3]) return 0
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)

  const appDate = new Date(year, month, day)
  const today = new Date()
  appDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - appDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function normalizeStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) return 'pending'
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) return 'approved'
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled'
  if (s.includes('received') || s.includes('app/')) return 'received'
  if (s.includes('under review')) return 'under review'
  return s
}

/** 10-Minute Auto Check: Priority for selected students in Application tab */
export async function runLocal10MinAutoCheck() {
  try {
    const db = await getTursoClient()

    const studentsRes = await db.execute({
      sql: `SELECT passport, "userId", "fullName", fullname, birthday, "visaType", visa_type, "applicationNo", application_no, "studentId", student_id, "applicationDate", "lastChecked", status 
            FROM students
            WHERE deletedAt IS NULL
              AND batchSelected = 1
              AND status IS NOT NULL
              AND LOWER(status) NOT IN ('pending', 'approved', 'visa used', 'cancelled', 'rejected', 'passport returned')`,
      args: []
    })

    const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
      const appDate = String(row.applicationDate || '')
      const statusRaw = String(row.status || '').toLowerCase()
      const daysSinceApplied = getDaysSinceApplication(appDate)

      const isUnderReview = statusRaw.includes('under review')
      const isSupplement = statusRaw.includes('supplement') || statusRaw.includes('asking')
      const isLocalStatus = statusRaw.includes('topshirilgan') || statusRaw.includes('ko\'rib chiqilmoqda')
      const isUnderReviewOrSupplement = isUnderReview || isSupplement || isLocalStatus

      const isApplied10DaysOrMore = Boolean(appDate) && daysSinceApplied >= 10

      return isUnderReviewOrSupplement || isApplied10DaysOrMore
    })

    if (eligibleRows.length === 0) {
      console.log('⏰ [Auto Check 10-Min] 0 eligible students found (all checked recently or <10 days).')
      return
    }

    console.log(`\n🚀 [Auto Check 10-Min] Starting auto-check for ${eligibleRows.length} selected student(s)...`)

    const queue = [...eligibleRows] as Record<string, unknown>[]
    const CONCURRENCY = 3
    let checkedCount = 0
    let failedCount = 0

    async function worker() {
      while (queue.length > 0) {
        const student = queue.shift()
        if (!student) break

        const passport = String(student.passport || '').toUpperCase().trim()
        const fullName = String(student.fullName || student.fullname || '')
        const userId = Number(student.userId)
        const oldStatus = String(student.status || 'Pending')

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const directCheckFn: any = (directVisaCheck as any).checkVisaDirect
          const liveResult = await directCheckFn(
            passport,
            fullName,
            String(student.birthday || ''),
            String(student.visaType || student.visa_type || 'Embassy'),
            String(student.applicationNo || student.application_no || '')
          )

          const nowIso = new Date().toISOString()
          const newStatus = liveResult.found ? liveResult.latestStatus : oldStatus
          const statusChanged = normalizeStatus(oldStatus) !== normalizeStatus(newStatus)
          const appDate = liveResult.latestDate || String(student.applicationDate || '')

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
                  check_source = 'auto',
                  checkSource = 'auto'
              WHERE passport = ? AND deletedAt IS NULL
            `,
            args: [
              newStatus,
              appDate,
              appDate,
              nowIso,
              nowIso,
              liveResult.rejectionReason || '',
              liveResult.pdfUrl || '',
              JSON.stringify(liveResult),
              passport
            ]
          })

          const updatedChanges = {
            status: newStatus,
            applicationDate: appDate,
            lastChecked: nowIso,
            rejectReason: liveResult.rejectionReason || '',
            pdfUrl: liveResult.pdfUrl || '',
            apiResponse: JSON.stringify(liveResult),
            check_source: 'auto',
            checkSource: 'auto'
          }

          // Realtime SSE push to browser
          publishRealtime(userId, {
            type: 'student.updated',
            eventId: crypto.randomUUID(),
            updatedAt: nowIso,
            originClientId: 'cron-local',
            passport,
            changes: updatedChanges
          }).catch(() => {})

          if (statusChanged) {
            sendTelegramNotification(userId, {
              fullName,
              passport,
              studentId: String(student.studentId || student.student_id || ''),
              visaType: String(student.visaType || student.visa_type || 'Embassy'),
              applicationNo: String(student.applicationNo || student.application_no || ''),
              birthday: String(student.birthday || ''),
              oldStatus,
              newStatus,
              applicationDate: appDate,
              rejectionReason: liveResult.rejectionReason || '',
              previousRejectionReason: liveResult.previousRejectionReason || '',
              invitingCompany: liveResult.invitingCompany || '',
              entryDate: liveResult.entryDate || '',
              pdfUrl: liveResult.pdfUrl || ''
            }).catch(() => {})
          }

          checkedCount++
          console.log(`  ✅ [${checkedCount}/${eligibleRows.length}] ${passport} (${fullName}): ${newStatus} (${appDate || 'no date'})`)
        } catch (err: unknown) {
          failedCount++
          console.error(`  ❌ ${passport} (${fullName}) failed:`, err instanceof Error ? err.message : String(err))
        }

        await new Promise(r => setTimeout(r, 60))
      }
    }

    const workerCount = Math.min(CONCURRENCY, queue.length)
    const workers = Array.from({ length: workerCount }, () => worker())
    await Promise.all(workers)

    console.log(`🏁 [Auto Check 10-Min] Finished batch! Completed: ${checkedCount}, Failed: ${failedCount}\n`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Auto Check 10-Min] Scheduler error:', msg)
  }
}

export default defineNitroPlugin(() => {
  console.log('⚡ [Auto Check Scheduler] Initialized in background.')

  // Run initial auto-check 10 seconds after server boots
  setTimeout(() => {
    runLocal10MinAutoCheck().catch(console.error)
  }, 10000)

  // Run every 10 minutes (600,000 ms)
  setInterval(() => {
    runLocal10MinAutoCheck().catch(console.error)
  }, 10 * 60 * 1000)
})
