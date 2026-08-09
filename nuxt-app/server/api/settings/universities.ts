/**
 * server/api/settings/universities.ts
 * GET  /api/settings/universities         — list
 * POST /api/settings/universities?action=create
 * POST /api/settings/universities?action=update
 * POST /api/settings/universities?action=delete
 */
import { getTursoClient } from '../../utils/turso'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'

import {
  ACCREDITED_UNIVERSITIES,
  JUNIOR_COLLEGES,
  ONE_PERCENT_UNIVERSITIES,
  ONE_PERCENT_COLLEGES,
  RESTRICTED_BACHELOR_UNIVERSITIES,
  RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES
} from '../../app/data/accredited-universities'

export default defineEventHandler(async (event) => {
  const authUser = await verifyToken(event)
  if (!authUser) apiError(401, 'Unauthorized.')

  const db = await getTursoClient()
  const userId = authUser!.userId

  if (event.method === 'GET') {
    let res = await db.execute({
      sql: 'SELECT * FROM settings_universities WHERE userId = ? ORDER BY name',
      args: [userId]
    })

    if (res.rows.length === 0) {
      const allInitial = Array.from(new Set([
        ...ACCREDITED_UNIVERSITIES,
        ...JUNIOR_COLLEGES,
        ...ONE_PERCENT_UNIVERSITIES,
        ...ONE_PERCENT_COLLEGES,
        ...RESTRICTED_BACHELOR_UNIVERSITIES,
        ...RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES
      ])).sort()

      const now = new Date().toISOString()
      const statements = allInitial.map(name => ({
        sql: 'INSERT INTO settings_universities (userId, name, location, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [userId, name, '', '', now, now]
      }))

      if (statements.length > 0) {
        await db.batch(statements)
      }

      res = await db.execute({
        sql: 'SELECT * FROM settings_universities WHERE userId = ? ORDER BY name',
        args: [userId]
      })
    }

    return res.rows
  }

  if (event.method === 'POST') {
    const query = getQuery(event)
    const action = query.action
    const body = await readBody(event)

    if (action === 'create') {
      const { name, location, notes } = body
      if (!name?.trim()) apiError(400, 'University name is required.')
      const now = new Date().toISOString()
      const res = await db.execute({
        sql: 'INSERT INTO settings_universities (userId, name, location, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [userId, name.trim(), location?.trim() || '', notes?.trim() || '', now, now]
      })
      return { success: true, id: Number(res.lastInsertRowid) }
    }

    if (action === 'update') {
      const { id, name, location, notes } = body
      if (!id) apiError(400, 'ID is required.')
      if (!name?.trim()) apiError(400, 'University name is required.')
      const now = new Date().toISOString()
      await db.execute({
        sql: 'UPDATE settings_universities SET name = ?, location = ?, notes = ?, updatedAt = ? WHERE id = ? AND userId = ?',
        args: [name.trim(), location?.trim() || '', notes?.trim() || '', now, id, userId]
      })
      return { success: true }
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) apiError(400, 'ID is required.')
      await db.execute({
        sql: 'DELETE FROM settings_universities WHERE id = ? AND userId = ?',
        args: [id, userId]
      })
      return { success: true }
    }

    apiError(400, 'Unknown action.')
  }

  apiError(405, 'Method not allowed.')
})
