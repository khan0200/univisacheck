import { randomUUID } from 'crypto'
import { getTursoClient } from '../../utils/turso'
import { invalidateAdmissionsCache } from '../admissions.get'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { action, id, payload = {} } = body

  try {
    const db = await getTursoClient()
    const now = new Date().toISOString()

    if (action === 'create') {
      const newId = payload.id || randomUUID()
      const university_name = String(payload.university_name || '').trim()
      const education_level = String(payload.education_level || '').trim()
      const admission_period = payload.admission_period ? String(payload.admission_period).trim() : ''
      const rounds_count = payload.rounds_count ? String(payload.rounds_count).trim() : ''
      const is_expected = payload.is_expected ? 1 : 0
      const expected_date_range = typeof payload.expected_date_range === 'object' && payload.expected_date_range !== null
        ? JSON.stringify(payload.expected_date_range)
        : (typeof payload.expected_date_range === 'string' ? payload.expected_date_range : '{}')
      const rounds = Array.isArray(payload.rounds)
        ? JSON.stringify(payload.rounds)
        : (typeof payload.rounds === 'string' ? payload.rounds : '[]')
      const visa_types = Array.isArray(payload.visa_types)
        ? JSON.stringify(payload.visa_types)
        : (typeof payload.visa_types === 'string' ? payload.visa_types : '[]')
      const university_types = Array.isArray(payload.university_types)
        ? JSON.stringify(payload.university_types)
        : (typeof payload.university_types === 'string' ? payload.university_types : '[]')
      const is_hidden = payload.is_hidden ? 1 : 0

      await db.execute({
        sql: `
          INSERT INTO admissions (
            id, university_name, education_level, admission_period, rounds_count,
            is_expected, expected_date_range, rounds, visa_types, university_types,
            is_hidden, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          newId,
          university_name,
          education_level,
          admission_period,
          rounds_count,
          is_expected,
          expected_date_range,
          rounds,
          visa_types,
          university_types,
          is_hidden,
          now,
          now
        ]
      })

      invalidateAdmissionsCache()

      return {
        success: true,
        data: {
          id: newId,
          university_name,
          education_level,
          admission_period: admission_period || null,
          rounds_count: rounds_count || null,
          is_expected: Boolean(is_expected),
          expected_date_range: payload.expected_date_range || {},
          rounds: payload.rounds || [],
          visa_types: payload.visa_types || [],
          university_types: payload.university_types || [],
          is_hidden: Boolean(is_hidden),
          created_at: now,
          updated_at: now
        }
      }
    }

    if (action === 'update' && id) {
      const university_name = String(payload.university_name || '').trim()
      const education_level = String(payload.education_level || '').trim()
      const admission_period = payload.admission_period ? String(payload.admission_period).trim() : ''
      const rounds_count = payload.rounds_count ? String(payload.rounds_count).trim() : ''
      const is_expected = payload.is_expected ? 1 : 0
      const expected_date_range = typeof payload.expected_date_range === 'object' && payload.expected_date_range !== null
        ? JSON.stringify(payload.expected_date_range)
        : (typeof payload.expected_date_range === 'string' ? payload.expected_date_range : '{}')
      const rounds = Array.isArray(payload.rounds)
        ? JSON.stringify(payload.rounds)
        : (typeof payload.rounds === 'string' ? payload.rounds : '[]')
      const visa_types = Array.isArray(payload.visa_types)
        ? JSON.stringify(payload.visa_types)
        : (typeof payload.visa_types === 'string' ? payload.visa_types : '[]')
      const university_types = Array.isArray(payload.university_types)
        ? JSON.stringify(payload.university_types)
        : (typeof payload.university_types === 'string' ? payload.university_types : '[]')

      await db.execute({
        sql: `
          UPDATE admissions SET
            university_name = ?,
            education_level = ?,
            admission_period = ?,
            rounds_count = ?,
            is_expected = ?,
            expected_date_range = ?,
            rounds = ?,
            visa_types = ?,
            university_types = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          university_name,
          education_level,
          admission_period,
          rounds_count,
          is_expected,
          expected_date_range,
          rounds,
          visa_types,
          university_types,
          now,
          id
        ]
      })

      invalidateAdmissionsCache()

      return {
        success: true,
        data: {
          id,
          university_name,
          education_level,
          admission_period: admission_period || null,
          rounds_count: rounds_count || null,
          is_expected: Boolean(is_expected),
          expected_date_range: payload.expected_date_range || {},
          rounds: payload.rounds || [],
          visa_types: payload.visa_types || [],
          university_types: payload.university_types || [],
          updated_at: now
        }
      }
    }

    if (action === 'toggle_hide' && id) {
      const is_hidden = payload.is_hidden ? 1 : 0
      await db.execute({
        sql: 'UPDATE admissions SET is_hidden = ?, updated_at = ? WHERE id = ?',
        args: [is_hidden, now, id]
      })

      invalidateAdmissionsCache()

      return {
        success: true,
        data: {
          id,
          is_hidden: Boolean(is_hidden),
          updated_at: now
        }
      }
    }

    if (action === 'delete' && id) {
      await db.execute({
        sql: 'DELETE FROM admissions WHERE id = ?',
        args: [id]
      })

      invalidateAdmissionsCache()

      return { success: true }
    }

    return { success: false, error: 'Invalid action or missing ID' }
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    console.error('[Turso Admissions Manage Error]:', err)
    return {
      success: false,
      error: errorObj?.message || 'Database operation failed'
    }
  }
})
