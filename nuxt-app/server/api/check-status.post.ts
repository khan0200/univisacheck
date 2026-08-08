import { checkStudentVisaStatus } from '../lib/visa'
import { getTursoClient } from '../utils/turso'
import { apiError } from '../utils/api-error'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const passport = (body.passport_number || body.passport || '').toUpperCase().trim()
    const fullName = (body.english_name || body.full_name || '').toUpperCase().trim()
    const birthDate = (body.birth_date || body.date_of_birth || '').trim()
    const visaType = (body.visa_type || body.visaType || 'Embassy').trim()
    const applicationNo = (body.application_no || body.applicationNo || '').trim()

    if (!passport || !fullName || !birthDate) {
      apiError(400, 'Missing required fields: passport, english_name, birth_date')
    }

    const db = await getTursoClient()

    // 1. Check if the student exists in the database.
    const studentRes = await db.execute({
      sql: 'SELECT userId, fullName, birthday, visaType, applicationNo FROM students WHERE passport = ? LIMIT 1',
      args: [passport]
    })

    if (studentRes.rows.length === 0) {
      // Fallback: If student does not exist, check directly (anonymous/public check fallback)
      console.log(`[Check Status] Student ${passport} not found in DB. Direct checking...`)
      const direct = await checkStudentVisaStatus(passport, fullName, birthDate, visaType, applicationNo)
      return {
        found: direct.found,
        status: direct.latestStatus,
        detail: direct.latestStatusKorean || direct.latestStatus,
        applicationDate: direct.latestDate || '',
        rejectionReason: direct.rejectionReason || '',
        pdfUrl: direct.pdfUrl || '',
        rawHtml: '',
        previousRejectionReason: direct.previousRejectionReason || '',
        entryDate: direct.entryDate || '',
        entryPurpose: direct.entryPurpose || '',
        visaExpiry: direct.visaExpiry || '',
        visaKind: direct.visaKind || '',
        statusOfResidence: direct.statusOfResidence || '',
        invitingCompany: direct.invitingCompany || '',
        resultCount: 0,
        source: 'visa.go.kr'
      }
    }

    const student = studentRes.rows[0] as unknown as {
      userId: number
      fullName: string
      birthday: string
      visaType: string
      applicationNo: string
    }
    const targetUserId = Number(student.userId || 0)

    // 2. Create Job and Task atomically in the queue
    const jobId = crypto.randomUUID()
    const taskId = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.batch([
      {
        sql: `INSERT INTO visa_check_jobs (id, userId, total, status, createdAt, updatedAt)
              VALUES (?, ?, 1, 'queued', ?, ?)`,
        args: [jobId, targetUserId, now, now]
      },
      {
        sql: `INSERT INTO visa_check_tasks (id, jobId, userId, passport, status, attempts, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
        args: [taskId, jobId, targetUserId, passport, now, now]
      }
    ], 'write')

    // 3. Trigger worker asynchronously using event.waitUntil
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const host = event.node.req.headers.host || 'localhost:3100'
    const workerUrl = `${protocol}://${host}/api/jobs/worker`

    console.log(`[Check Status API] Triggering worker for queued check of ${passport}`)
    const triggerPromise = $fetch(workerUrl, {
      method: 'POST'
    }).catch((err) => {
      console.error('[Check Status API] Worker trigger request failed:', err.message)
    })
    event.waitUntil(triggerPromise)

    // 4. Poll the task status until completed or failed (up to 15 seconds)
    const pollStart = Date.now()
    let taskStatus = 'queued'
    let taskError = ''

    while (Date.now() - pollStart < 15000) {
      await new Promise(resolve => setTimeout(resolve, 200))
      const taskRes = await db.execute({
        sql: 'SELECT status, error FROM visa_check_tasks WHERE id = ?',
        args: [taskId]
      })
      if (taskRes.rows.length > 0 && taskRes.rows[0]) {
        taskStatus = String(taskRes.rows[0].status)
        taskError = String(taskRes.rows[0].error || '')
        if (taskStatus === 'completed' || taskStatus === 'failed') {
          break
        }
      }
    }

    if (taskStatus !== 'completed') {
      throw createError({
        statusCode: 500,
        statusMessage: taskError || 'Visa check request in queue timed out.'
      })
    }

    // 5. Retrieve updated student details
    const updatedStudentRes = await db.execute({
      sql: 'SELECT * FROM students WHERE passport = ? LIMIT 1',
      args: [passport]
    })

    if (updatedStudentRes.rows.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Student record was deleted during check.'
      })
    }

    const updatedStudent = updatedStudentRes.rows[0] as unknown as Record<string, unknown>
    let apiResponse: Record<string, any> = {}
    try {
      apiResponse = typeof updatedStudent.apiResponse === 'string'
        ? JSON.parse(updatedStudent.apiResponse || '{}')
        : (updatedStudent.apiResponse as Record<string, any>) || {}
    } catch {
      apiResponse = {}
    }

    return {
      found: apiResponse.found ?? true,
      status: updatedStudent.status,
      detail: apiResponse.latestStatusKorean || updatedStudent.status,
      applicationDate: updatedStudent.applicationDate || '',
      rejectionReason: updatedStudent.rejectReason || '',
      pdfUrl: updatedStudent.pdfUrl || '',
      rawHtml: '',
      previousRejectionReason: apiResponse.previousRejectionReason || '',
      entryDate: apiResponse.entryDate || '',
      entryPurpose: apiResponse.entryPurpose || '',
      visaExpiry: apiResponse.visaExpiry || '',
      visaKind: apiResponse.visaKind || '',
      statusOfResidence: apiResponse.statusOfResidence || '',
      invitingCompany: apiResponse.invitingCompany || '',
      resultCount: 0,
      source: 'visa.go.kr'
    }
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number, message?: string }
    if (errorObj.statusCode) throw err
    console.error('[Check Status] Error:', errorObj.message || String(err))
    apiError(500, errorObj.message || String(err))
  }
})
