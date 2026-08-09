/**
 * server/api/settings/tariffs.ts
 * GET  /api/settings/tariffs         — list
 * POST /api/settings/tariffs?action=create|update|delete
 */
import { getTursoClient } from '../../utils/turso'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'

export default defineEventHandler(async (event) => {
  const authUser = await verifyToken(event)
  if (!authUser) apiError(401, 'Unauthorized.')

  const db = await getTursoClient()
  const userId = authUser!.userId

  if (event.method === 'GET') {
    const res = await db.execute({
      sql: 'SELECT * FROM settings_tariffs WHERE userId = ? ORDER BY name',
      args: [userId]
    })
    return res.rows
  }

  if (event.method === 'POST') {
    const query = getQuery(event)
    const action = query.action
    const body = await readBody(event)

    if (action === 'create') {
      const { name, price, currency, description } = body
      if (!name?.trim()) apiError(400, 'Tariff name is required.')
      const now = new Date().toISOString()
      const res = await db.execute({
        sql: 'INSERT INTO settings_tariffs (userId, name, price, currency, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [userId, name.trim(), price?.trim() || '', currency?.trim() || 'USD', description?.trim() || '', now, now]
      })
      return { success: true, id: Number(res.lastInsertRowid) }
    }

    if (action === 'update') {
      const { id, name, price, currency, description } = body
      if (!id) apiError(400, 'ID is required.')
      if (!name?.trim()) apiError(400, 'Tariff name is required.')
      const now = new Date().toISOString()
      await db.execute({
        sql: 'UPDATE settings_tariffs SET name = ?, price = ?, currency = ?, description = ?, updatedAt = ? WHERE id = ? AND userId = ?',
        args: [name.trim(), price?.trim() || '', currency?.trim() || 'USD', description?.trim() || '', now, id, userId]
      })
      return { success: true }
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) apiError(400, 'ID is required.')
      await db.execute({
        sql: 'DELETE FROM settings_tariffs WHERE id = ? AND userId = ?',
        args: [id, userId]
      })
      return { success: true }
    }

    apiError(400, 'Unknown action.')
  }

  apiError(405, 'Method not allowed.')
})
