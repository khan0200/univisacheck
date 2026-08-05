import { getTursoClient } from '../utils/turso'
import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'

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
  } catch (err: any) {
    console.error('[Students API] Failed to sync students_count:', err.message)
  }
}

export default defineEventHandler(async (event) => {
  const db = await getTursoClient()
  const method = event.method
  const query = getQuery(event)

  try {
    // ── Public: GET by passport (for student self-check page) ──────────────
    // GET /api/students?passport=XX1234567&public=true → returns limited fields, no auth
    // Intentionally includes soft-deleted rows too, so re-adding a deleted
    // student can still autofill from their last known name/birthday.
    // Falls back to bot_manual_refreshes if the passport was only ever
    // checked via the Telegram bot (not yet added to any cabinet).
    if (method === 'GET' && query.public === 'true') {
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
        const row = botResult.rows[0] as any
        return [{
          passport: row.passport,
          fullName: row.fullName || '',
          birthday: row.birthday || '',
          visaType: row.visaType || 'Embassy',
          applicationNo: row.applicationNo || '',
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
        return result.rows.map((r: any) => ({ ...r, batchSelected: r.batchSelected === 1 }))
      } else {
        const result = await db.execute({
          sql: 'SELECT * FROM students WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC',
          args: [userId]
        })
        return result.rows.map((r: any) => ({ ...r, batchSelected: r.batchSelected === 1 }))
      }
    }

    if (method === 'DELETE') {
      const passport = query.passport as string | undefined
      if (!passport) apiError(400, 'Missing passport parameter')

      const passports = passport!.split(',').map((p) => p.toUpperCase().trim()).filter(Boolean)
      if (passports.length === 0) apiError(400, 'No valid passports provided')

      // Soft delete: mark deletedAt instead of removing the row, so the
      // student disappears from this user's dashboard but their data is
      // still there to autofill from if the same passport is re-added later.
      const placeholders = passports.map(() => '?').join(', ')
      const sql = `UPDATE students SET deletedAt = ? WHERE passport IN (${placeholders}) AND userId = ?`
      const args = [new Date().toISOString(), ...passports, userId]
      await db.execute({ sql, args })
      await syncStudentsCount(db, userId)

      return { success: true }
    }

    if (method === 'POST' || method === 'PATCH') {
      const body = await readBody(event)
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
      const isRevive = exists && (check.rows[0] as any).deletedAt

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

      let batchSelected: number | null = null
      if (body.batchSelected !== undefined) {
        batchSelected = body.batchSelected ? 1 : 0
      }

      let lastChecked: string | null = null
      if (body.lastChecked !== undefined) {
        lastChecked = new Date().toISOString()
      }

      let batchSelectedUpdatedAt: string | null = null
      if (body.batchSelectedUpdatedAt !== undefined) {
        batchSelectedUpdatedAt = new Date().toISOString()
      }

      if (!exists) {
        const sql = `
                    INSERT INTO students (
                        passport, fullName, birthday, studentId, status,
                        applicationDate, lastChecked, rejectReason, pdfUrl, apiResponse,
                        batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
                `
        await db.execute({
          sql,
          args: [
            passport,
            fullName || '',
            birthday || '',
            studentId || '',
            status || 'Pending',
            applicationDate || '',
            lastChecked || new Date().toISOString(),
            rejectReason || '',
            pdfUrl || '',
            apiResponse || '',
            batchSelected !== null ? batchSelected : 0,
            batchSelectedUpdatedAt || '',
            userId,
            visaType || 'Embassy',
            applicationNo || ''
          ]
        })
        await syncStudentsCount(db, userId)
        setResponseStatus(event, 201)
        return { success: true, message: 'Student created successfully' }
      } else {
        const updateFields: string[] = []
        const args: any[] = []

        if (isRename) { updateFields.push('passport = ?'); args.push(passport) }
        if (isRevive) { updateFields.push('deletedAt = NULL') }
        if (fullName !== null) { updateFields.push('fullName = ?'); args.push(fullName) }
        if (birthday !== null) { updateFields.push('birthday = ?'); args.push(birthday) }
        if (studentId !== null) { updateFields.push('studentId = ?'); args.push(studentId) }
        if (status !== null) { updateFields.push('status = ?'); args.push(status) }
        if (applicationDate !== null) { updateFields.push('applicationDate = ?'); args.push(applicationDate) }
        if (lastChecked !== null) { updateFields.push('lastChecked = ?'); args.push(lastChecked) }
        if (rejectReason !== null) { updateFields.push('rejectReason = ?'); args.push(rejectReason) }
        if (pdfUrl !== null) { updateFields.push('pdfUrl = ?'); args.push(pdfUrl) }
        if (apiResponse !== null) { updateFields.push('apiResponse = ?'); args.push(apiResponse) }
        if (batchSelected !== null) { updateFields.push('batchSelected = ?'); args.push(batchSelected) }
        if (batchSelectedUpdatedAt !== null) { updateFields.push('batchSelectedUpdatedAt = ?'); args.push(batchSelectedUpdatedAt) }
        if (visaType !== null) { updateFields.push('visaType = ?'); args.push(visaType) }
        if (applicationNo !== null) { updateFields.push('applicationNo = ?'); args.push(applicationNo) }

        if (updateFields.length === 0) {
          return { success: true, message: 'No fields to update' }
        }

        args.push(isRename ? originalPassport : passport, userId)
        const sql = `UPDATE students SET ${updateFields.join(', ')} WHERE passport = ? AND userId = ?`
        await db.execute({ sql, args })
        // Ordinary edits leave the count alone; a revive clears
        // deletedAt and puts the student back in the cabinet.
        if (isRevive) await syncStudentsCount(db, userId)
        return { success: true, message: 'Student updated successfully' }
      }
    }

    apiError(405, 'Method not allowed')
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('[Students API] Error:', err.message)
    apiError(500, err.message)
  }
})
