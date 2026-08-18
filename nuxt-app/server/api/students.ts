import { getTursoClient } from '../utils/turso'
import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'
import { publishRealtime } from '../utils/realtime-publisher'
import type { StudentPayload, StudentRealtimeEvent } from '../utils/realtime-types'

// Keeps users.students_count in step with how many active students the
// cabinet holds. Recomputed from the students table rather than
// incremented, so the column self-heals if a write is ever missed.
// Never lets a bookkeeping failure break the student operation that
// already succeeded — the count is reporting data, not source of truth.
async function syncStudentsCount(db: Awaited<ReturnType<typeof getTursoClient>>, userId: number) {
  try {
    await db.execute({
      sql: `UPDATE users SET students_count = (
                SELECT COUNT(*) FROM students
                WHERE students.userId = ? AND students.deletedAt IS NULL
            ) WHERE id = ?`,
      args: [userId, userId]
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Students API] Failed to sync students_count:', msg)
  }
}

/** Fetch a single student row by passport + userId and return as StudentPayload. */
async function fetchStudentPayload(
  db: Awaited<ReturnType<typeof getTursoClient>>,
  passport: string,
  userId: number
): Promise<StudentPayload | null> {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM students WHERE passport = ? AND userId = ?',
      args: [passport, userId]
    })
    if (result.rows.length === 0) return null
    const r = result.rows[0] as unknown as Record<string, unknown>
    return {
      passport: String(r.passport || ''),
      fullName: String(r.fullName || ''),
      birthday: String(r.birthday || ''),
      studentId: String(r.studentId || ''),
      status: String(r.status || 'Pending'),
      applicationDate: String(r.applicationDate || ''),
      lastChecked: String(r.lastChecked || ''),
      rejectReason: String(r.rejectReason || ''),
      pdfUrl: String(r.pdfUrl || ''),
      apiResponse: String(r.apiResponse || ''),
      batchSelected: r.batchSelected === 1,
      batchSelectedUpdatedAt: String(r.batchSelectedUpdatedAt || ''),
      createdAt: String(r.createdAt || ''),
      userId: Number(r.userId),
      visaType: (r.visaType as StudentPayload['visaType']) || 'Embassy',
      applicationNo: String(r.applicationNo || ''),
      deletedAt: (r.deletedAt as string | null) || null,
      pinned: r.pinned === 1,
      tariff: r.tariff ? String(r.tariff) : undefined,
      university: r.university ? String(r.university) : undefined,
      coordinator: r.coordinator ? String(r.coordinator) : undefined,
      b2b: r.b2b ? String(r.b2b) : undefined,
      check_source: r.check_source ? String(r.check_source) : 'manual',
      checkSource: r.checkSource ? String(r.checkSource) : (r.check_source ? String(r.check_source) : 'manual')
    }
  } catch {
    return null
  }
}

/** Publish an event after a successful DB write. Never throws. */
async function publishEvent(userId: number, realtimeEvent: StudentRealtimeEvent) {
  try {
    await publishRealtime(userId, realtimeEvent)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Students API] Realtime publish failed:', msg)
  }
}

export default defineEventHandler(async (event) => {
  const db = await getTursoClient()
  const method = event.method
  const query = getQuery(event)

  // Read the originClientId header that the frontend attaches to every
  // mutation request (used by the client to skip its own events).
  const originClientId = (getHeader(event, 'x-client-id') || 'unknown') as string

  try {
    // ── Public: GET by passport (for student self-check page) ──────────────
    // GET /api/students?passport=FA1234567&public=true → returns limited fields, no auth
    // Intentionally includes soft-deleted rows too, so re-adding a deleted
    // student can still autofill from their last known name/birthday.
    // Falls back to bot_manual_refreshes if the passport was only ever
    // checked via the Telegram bot (not yet added to any cabinet).
    if (method === 'GET' && query.public === 'true') {
      setResponseHeaders(event, {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300'
      })

      const passport = query.passport as string | undefined
      if (!passport) apiError(400, 'Missing passport parameter')

      const passportKey = passport!.toUpperCase().trim()
      const result = await db.execute({
        sql: 'SELECT passport, fullName, birthday, status, applicationDate, lastChecked, rejectReason, pdfUrl, visaType, applicationNo, apiResponse FROM students WHERE passport = ?',
        args: [passportKey]
      })

      if (result.rows.length > 0) {
        return result.rows
      }

      const botResult = await db.execute({
        sql: 'SELECT passport, fullname AS fullName, birthday, visa_type AS visaType, application_no AS applicationNo FROM bot_manual_refreshes WHERE passport = ?',
        args: [passportKey]
      })

      if (botResult.rows.length > 0) {
        const row = botResult.rows[0] as unknown as Record<string, unknown>
        return [{
          passport: String(row.passport || ''),
          fullName: String(row.fullName || ''),
          birthday: String(row.birthday || ''),
          visaType: String(row.visaType || 'Embassy'),
          applicationNo: String(row.applicationNo || ''),
          status: null,
          applicationDate: null,
          lastChecked: null,
          rejectReason: null,
          pdfUrl: null,
          apiResponse: null
        }]
      }

      return []
    }

    // ── All other operations require authentication ─────────────────────────
    setResponseHeaders(event, {
      'Cache-Control': 'private, no-cache, no-store, must-revalidate'
    })

    const authUser = await verifyToken(event)
    if (!authUser) apiError(401, 'Unauthorized. Please log in.')
    const userId = authUser!.userId

    if (method === 'GET') {
      const passport = query.passport as string | undefined
      if (passport) {
        const result = await db.execute({
          sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
          args: [passport.toUpperCase().trim(), userId]
        })
        return result.rows.map((r) => {
          const row = r as unknown as Record<string, unknown>
          return {
            ...row,
            batchSelected: row.batchSelected === 1,
            pinned: row.pinned === 1,
            check_source: row.check_source ? String(row.check_source) : 'manual',
            checkSource: row.checkSource ? String(row.checkSource) : (row.check_source ? String(row.check_source) : 'manual')
          }
        })
      } else {
        const result = await db.execute({
          sql: `SELECT 
                  passport, fullName, birthday, studentId, status,
                  applicationDate, lastChecked, rejectReason, pdfUrl,
                  batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo, pinned,
                  tariff, university, coordinator, b2b, check_source, checkSource, apiResponse
                FROM students 
                WHERE userId = ? AND deletedAt IS NULL 
                ORDER BY createdAt DESC`,
          args: [userId]
        })
        return result.rows.map((r) => {
          const row = r as unknown as Record<string, unknown>
          return {
            ...row,
            batchSelected: row.batchSelected === 1,
            pinned: row.pinned === 1,
            check_source: row.check_source ? String(row.check_source) : 'manual',
            checkSource: row.checkSource ? String(row.checkSource) : (row.check_source ? String(row.check_source) : 'manual')
          }
        })
      }
    }

    if (method === 'DELETE') {
      const passport = query.passport as string | undefined
      if (!passport) apiError(400, 'Missing passport parameter')

      const passports = passport!.split(',').map(p => p.toUpperCase().trim()).filter(Boolean)
      if (passports.length === 0) apiError(400, 'No valid passports provided')

      // Soft delete: mark deletedAt instead of removing the row, so the
      // student disappears from this user's dashboard but their data is
      // still there to autofill from if the same passport is re-added later.
      const placeholders = passports.map(() => '?').join(', ')
      const deletedAt = new Date().toISOString()
      const sql = `UPDATE students SET deletedAt = ? WHERE passport IN (${placeholders}) AND userId = ?`
      const args = [deletedAt, ...passports, userId]
      await db.execute({ sql, args })
      await syncStudentsCount(db, userId)

      // ── Realtime: student.deleted ────────────────────────────────────────
      publishEvent(userId, {
        type: 'student.deleted',
        eventId: crypto.randomUUID(),
        updatedAt: deletedAt,
        originClientId,
        passports
      })

      return { success: true }
    }

    if (method === 'POST' || method === 'PATCH') {
      const body = await readBody(event)

      if (method === 'PATCH' && (Array.isArray(body.passports) || (typeof body.passports === 'string' && body.passports.includes(',')))) {
        const rawPassports: string[] = Array.isArray(body.passports)
          ? body.passports
          : String(body.passports).split(',')
        const passports = rawPassports.map(p => String(p).toUpperCase().trim()).filter(Boolean)
        if (passports.length === 0) apiError(400, 'Missing passports in request body')

        const batchSelected = body.batchSelected !== undefined ? (body.batchSelected ? 1 : 0) : null
        const batchSelectedUpdatedAt = body.batchSelectedUpdatedAt ? new Date().toISOString() : null

        if (batchSelected !== null) {
          const placeholders = passports.map(() => '?').join(',')
          const sql = `UPDATE students SET batchSelected = ?, batchSelectedUpdatedAt = ? WHERE userId = ? AND passport IN (${placeholders})`
          const eventTimestamp = batchSelectedUpdatedAt || new Date().toISOString()
          await db.execute({
            sql,
            args: [batchSelected, eventTimestamp, userId, ...passports]
          })

          const originClientId = getHeader(event, 'x-client-id') || ''
          for (const p of passports) {
            publishEvent(userId, {
              type: 'student.updated',
              eventId: crypto.randomUUID(),
              updatedAt: eventTimestamp,
              originClientId,
              passport: p,
              changes: {
                batchSelected: batchSelected === 1,
                batchSelectedUpdatedAt: eventTimestamp
              }
            })
          }
        }

        return { success: true }
      }

      const passport = (body.passport || '').toUpperCase().trim()
      // originalPassport is sent only when editing an existing student whose
      // passport number itself is being changed — it identifies which row to
      // update, while `passport` carries the new value to save into it.
      const originalPassport = (body.originalPassport || '').toUpperCase().trim()
      const isRename = originalPassport && originalPassport !== passport

      if (!passport) apiError(400, 'Missing passport in request body')

      // `passport` is globally UNIQUE in the DB (not scoped per user) — even
      // a soft-deleted row still occupies its passport slot — so every check
      // against it must be global, or an INSERT/UPDATE below can throw a raw
      // SQLITE_CONSTRAINT instead of a clean error. A soft-deleted row can
      // only be revived by the same user who deleted it; otherwise a passport
      // held by someone else's row (active or soft-deleted) is a hard conflict.
      let hasConflict = false
      if (isRename) {
        const ownsOriginal = await db.execute({
          sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ?',
          args: [originalPassport, userId]
        })
        if (ownsOriginal.rows.length === 0) apiError(404, 'Student not found.')

        const collision = await db.execute({
          sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
          args: [passport, userId]
        })
        if (collision.rows.length > 0) hasConflict = true
      } else {
        const checkExistence = await db.execute({
          sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ?',
          args: [passport, userId]
        })
        if (checkExistence.rows.length === 0) {
          const userMatch = await db.execute({
            sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
            args: [passport, userId]
          })
          if (userMatch.rows.length > 0) hasConflict = true
        }
      }

      if (hasConflict) apiError(409, `Passport ${passport} is already registered under your account.`)

      // Check if a row for THIS USER already exists — active OR soft-deleted
      // (decides INSERT vs UPDATE; reviving a soft-deleted row is an UPDATE
      // that also clears deletedAt below).
      const check = await db.execute({
        sql: 'SELECT passport, deletedAt FROM students WHERE passport = ? AND userId = ?',
        args: [isRename ? originalPassport : passport, userId]
      })
      const exists = check.rows.length > 0
      const isRevive = exists && Boolean((check.rows[0] as unknown as Record<string, unknown>).deletedAt)

      const fullName = body.fullName !== undefined ? body.fullName.toUpperCase().trim() : null
      const birthday = body.birthday !== undefined ? body.birthday.trim() : null
      const studentId = body.studentId !== undefined ? body.studentId.trim() : null
      const status = body.status !== undefined ? body.status : null
      const applicationDate = body.applicationDate !== undefined ? body.applicationDate.trim() : null
      const rejectReason = body.rejectReason !== undefined ? body.rejectReason : (body.rejectionReason !== undefined ? body.rejectionReason : null)
      const pdfUrl = body.pdfUrl !== undefined ? body.pdfUrl : null
      const apiResponse = body.apiResponse !== undefined ? (typeof body.apiResponse === 'object' ? JSON.stringify(body.apiResponse) : body.apiResponse) : null
      const visaType = body.visaType !== undefined ? body.visaType.trim() : null
      const applicationNo = body.applicationNo !== undefined ? body.applicationNo.trim() : null
      const tariff = body.tariff !== undefined ? body.tariff : null
      const university = body.university !== undefined ? body.university : null
      const coordinator = body.coordinator !== undefined ? body.coordinator : null
      const b2b = body.b2b !== undefined ? body.b2b : null

      let batchSelected: number | null = null
      if (body.batchSelected !== undefined) {
        batchSelected = body.batchSelected ? 1 : 0
      }

      let pinned: number | null = null
      if (body.pinned !== undefined) {
        pinned = body.pinned ? 1 : 0
      }

      let lastChecked: string | null = null
      if (body.lastChecked !== undefined) {
        lastChecked = new Date().toISOString()
      }

      let batchSelectedUpdatedAt: string | null = null
      if (body.batchSelectedUpdatedAt !== undefined) {
        batchSelectedUpdatedAt = new Date().toISOString()
      }

      const eventTimestamp = new Date().toISOString()

      if (!exists) {
        // Check if this passport was already checked by another cabinet/user
        const existingCheck = await db.execute({
          sql: 'SELECT status, applicationDate, lastChecked, rejectReason, pdfUrl, apiResponse FROM students WHERE passport = ? AND deletedAt IS NULL AND lastChecked IS NOT NULL LIMIT 1',
          args: [passport]
        })

        let inheritedStatus = status || 'Pending'
        let inheritedAppDate = applicationDate || ''
        let inheritedLastChecked = lastChecked || new Date().toISOString()
        let inheritedRejectReason = rejectReason || ''
        let inheritedPdfUrl = pdfUrl || ''
        let inheritedApiResponse = apiResponse || ''

        if (existingCheck.rows.length > 0) {
          const prev = existingCheck.rows[0] as unknown as Record<string, unknown>
          if (!status && prev.status) inheritedStatus = String(prev.status)
          if (!applicationDate && prev.applicationDate) inheritedAppDate = String(prev.applicationDate)
          if (!lastChecked && prev.lastChecked) inheritedLastChecked = String(prev.lastChecked)
          if (!rejectReason && prev.rejectReason) inheritedRejectReason = String(prev.rejectReason)
          if (!pdfUrl && prev.pdfUrl) inheritedPdfUrl = String(prev.pdfUrl)
          if (!apiResponse && prev.apiResponse) inheritedApiResponse = String(prev.apiResponse)
        }

        // ── INSERT ───────────────────────────────────────────────────────────
        const sql = `
                    INSERT INTO students (
                        passport, fullName, birthday, studentId, status,
                        applicationDate, lastChecked, rejectReason, pdfUrl, apiResponse,
                        batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo, pinned,
                        tariff, university, coordinator, b2b
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
                `
        await db.execute({
          sql,
          args: [
            passport,
            fullName || '',
            birthday || '',
            studentId || '',
            inheritedStatus,
            inheritedAppDate,
            inheritedLastChecked,
            inheritedRejectReason,
            inheritedPdfUrl,
            inheritedApiResponse,
            batchSelected !== null ? batchSelected : 0,
            batchSelectedUpdatedAt || '',
            userId,
            visaType || 'Embassy',
            applicationNo || '',
            pinned !== null ? pinned : 0,
            tariff || '',
            university || '',
            coordinator || '',
            b2b || ''
          ]
        })
        await syncStudentsCount(db, userId)

        // ── Realtime: student.created ────────────────────────────────────────
        const created = await fetchStudentPayload(db, passport, userId)
        if (created) {
          publishEvent(userId, {
            type: 'student.created',
            eventId: crypto.randomUUID(),
            updatedAt: eventTimestamp,
            originClientId,
            student: created
          })
        }

        setResponseStatus(event, 201)
        return { success: true, message: 'Student created successfully' }
      } else {
        // ── UPDATE ───────────────────────────────────────────────────────────
        const updateFields: string[] = []
        const args: (string | number | boolean | null)[] = []

        // Track which fields actually changed for the realtime event payload
        const changedFields: Record<string, unknown> = {}

        if (isRename) {
          updateFields.push('passport = ?')
          args.push(passport)
          changedFields.passport = passport
        }
        if (isRevive) {
          updateFields.push('deletedAt = NULL')
          changedFields.deletedAt = null
        }
        if (fullName !== null) {
          updateFields.push('fullName = ?')
          args.push(fullName)
          changedFields.fullName = fullName
        }
        if (birthday !== null) {
          updateFields.push('birthday = ?')
          args.push(birthday)
          changedFields.birthday = birthday
        }
        if (studentId !== null) {
          updateFields.push('studentId = ?')
          args.push(studentId)
          changedFields.studentId = studentId
        }
        if (status !== null) {
          updateFields.push('status = ?')
          args.push(status)
          changedFields.status = status
        }
        if (applicationDate !== null) {
          updateFields.push('applicationDate = ?')
          args.push(applicationDate)
          changedFields.applicationDate = applicationDate
        }
        if (lastChecked !== null) {
          updateFields.push('lastChecked = ?')
          args.push(lastChecked)
          changedFields.lastChecked = lastChecked
        }
        if (rejectReason !== null) {
          updateFields.push('rejectReason = ?')
          args.push(rejectReason)
          changedFields.rejectReason = rejectReason
        }
        if (pdfUrl !== null) {
          updateFields.push('pdfUrl = ?')
          args.push(pdfUrl)
          changedFields.pdfUrl = pdfUrl
        }
        if (apiResponse !== null) {
          updateFields.push('apiResponse = ?')
          args.push(apiResponse)
          changedFields.apiResponse = apiResponse
        }
        if (batchSelected !== null) {
          updateFields.push('batchSelected = ?')
          args.push(batchSelected)
          changedFields.batchSelected = batchSelected === 1
        }
        if (batchSelectedUpdatedAt !== null) {
          updateFields.push('batchSelectedUpdatedAt = ?')
          args.push(batchSelectedUpdatedAt)
          changedFields.batchSelectedUpdatedAt = batchSelectedUpdatedAt
        }
        if (visaType !== null) {
          updateFields.push('visaType = ?')
          args.push(visaType)
          changedFields.visaType = visaType
        }
        if (applicationNo !== null) {
          updateFields.push('applicationNo = ?')
          args.push(applicationNo)
          changedFields.applicationNo = applicationNo
        }
        if (pinned !== null) {
          updateFields.push('pinned = ?')
          args.push(pinned)
          changedFields.pinned = pinned === 1
        }
        if (tariff !== null) {
          updateFields.push('tariff = ?')
          args.push(tariff)
          changedFields.tariff = tariff
        }
        if (university !== null) {
          updateFields.push('university = ?')
          args.push(university)
          changedFields.university = university
        }
        if (coordinator !== null) {
          updateFields.push('coordinator = ?')
          args.push(coordinator)
          changedFields.coordinator = coordinator
        }
        if (b2b !== null) {
          updateFields.push('b2b = ?')
          args.push(b2b)
          changedFields.b2b = b2b
        }

        if (updateFields.length === 0) {
          return { success: true, message: 'No fields to update' }
        }

        args.push(isRename ? originalPassport : passport, userId)
        const sql = `UPDATE students SET ${updateFields.join(', ')} WHERE passport = ? AND userId = ?`
        await db.execute({ sql, args })

        // Ordinary edits leave the count alone; a revive clears
        // deletedAt and puts the student back in the cabinet.
        if (isRevive) await syncStudentsCount(db, userId)

        // ── Realtime: student.restored or student.updated ────────────────────
        if (isRevive) {
          // The student is coming back from soft-delete — send full object
          const effectivePassport = isRename ? passport : originalPassport
          const restored = await fetchStudentPayload(db, effectivePassport, userId)
          if (restored) {
            publishEvent(userId, {
              type: 'student.restored',
              eventId: crypto.randomUUID(),
              updatedAt: eventTimestamp,
              originClientId,
              student: restored
            })
          }
        } else {
          // Regular field update — send only changed fields (efficient)
          publishEvent(userId, {
            type: 'student.updated',
            eventId: crypto.randomUUID(),
            updatedAt: eventTimestamp,
            originClientId,
            passport: isRename ? originalPassport : passport,
            changes: changedFields
          })
        }

        return { success: true, message: 'Student updated successfully' }
      }
    }

    apiError(405, 'Method not allowed')
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number, message?: string }
    if (errorObj.statusCode) throw err
    console.error('[Students API] Error:', errorObj.message || String(err))
    apiError(500, errorObj.message || String(err))
  }
})
