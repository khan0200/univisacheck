/**
 * server/api/notify-telegram.post.ts
 *
 * Keeps legacy route active by delegating directly to the consolidated
 * telegram-notifier utility.
 */

import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'
import { sendTelegramNotification } from '../utils/telegram-notifier'

export default defineEventHandler(async (event) => {
  // ── Require JWT authentication ─────────────────────────────────────────
  const authUser = await verifyToken(event)
  if (!authUser || !authUser.userId) {
    apiError(401, 'Unauthorized. Please log in.')
  }

  const body = (await readBody(event)) || {}
  const passport = (body.passport || '').toUpperCase().trim()

  if (!passport) {
    apiError(400, 'Missing passport in request body')
  }

  try {
    const result = await sendTelegramNotification(authUser.userId, {
      fullName: body.fullName || '',
      passport,
      studentId: body.studentId || '',
      visaType: body.visaType || 'Embassy',
      applicationNo: body.applicationNo || '',
      birthday: body.birthday || '',
      oldStatus: body.oldStatus || '',
      newStatus: body.newStatus || '',
      applicationDate: body.applicationDate || '',
      rejectionReason: body.rejectionReason || body.rejectReason || '',
      previousRejectionReason: body.previousRejectionReason || '',
      invitingCompany: body.invitingCompany || '',
      entryDate: body.entryDate || '',
      pdfUrl: body.pdfUrl || ''
    })

    return result
  } catch (err: any) {
    console.error('[Notify Telegram Route] Error:', err.message)
    apiError(500, err.message)
  }
})
