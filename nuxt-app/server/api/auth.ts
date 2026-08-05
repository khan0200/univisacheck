import bcrypt from 'bcryptjs'
import { getTursoClient } from '../utils/turso'
import { signToken, verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'

const SALT_ROUNDS = 12

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const action = query.action

  // ──────────────────────────────────────────────
  // POST /api/auth?action=signup
  // ──────────────────────────────────────────────
  if (action === 'signup' && event.method === 'POST') {
    try {
      const { email, username, password, confirmPassword } = await readBody(event)

      if (!email || !username || !password) apiError(400, 'Email, username and password are required.')
      if (!validateEmail(email)) apiError(400, 'Invalid email address.')
      if (username.trim().length < 2) apiError(400, 'Username must be at least 2 characters.')
      if (password.length < 6) apiError(400, 'Password must be at least 6 characters.')
      if (confirmPassword && password !== confirmPassword) apiError(400, 'Passwords do not match.')

      const db = await getTursoClient()

      const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [email.toLowerCase().trim()]
      })
      if (existing.rows.length > 0) apiError(409, 'An account with this email already exists.')

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

      const result = await db.execute({
        sql: 'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
        args: [email.toLowerCase().trim(), username.trim(), hashedPassword]
      })

      const user = {
        id: Number(result.lastInsertRowid),
        email: email.toLowerCase().trim(),
        username: username.trim()
      }

      const token = await signToken(user)

      setResponseStatus(event, 201)
      return { token, user }
    } catch (err: any) {
      if (err.statusCode) throw err
      console.error('[Auth] Signup error:', err.message)
      apiError(500, 'Server error during signup.')
    }
  }

  // ──────────────────────────────────────────────
  // POST /api/auth?action=login
  // ──────────────────────────────────────────────
  if (action === 'login' && event.method === 'POST') {
    try {
      const { email, password } = await readBody(event)

      if (!email || !password) apiError(400, 'Email and password are required.')

      const identifier = email.trim().toLowerCase()
      const db = await getTursoClient()
      const result = await db.execute({
        sql: 'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
        args: [identifier, identifier]
      })

      if (result.rows.length === 0) apiError(401, 'Invalid email/username or password.')

      const user = result.rows[0] as any
      const passwordMatch = await bcrypt.compare(password, user.password)

      if (!passwordMatch) apiError(401, 'Invalid email or password.')

      const token = await signToken({ id: Number(user.id), email: user.email, username: user.username })

      return {
        token,
        user: { id: Number(user.id), email: user.email, username: user.username }
      }
    } catch (err: any) {
      if (err.statusCode) throw err
      console.error('[Auth] Login error:', err.message)
      apiError(500, 'Server error during login.')
    }
  }

  // ──────────────────────────────────────────────
  // GET /api/auth?action=me
  // ──────────────────────────────────────────────
  if (action === 'me' && event.method === 'GET') {
    const user = await verifyToken(event)
    if (!user) apiError(401, 'Unauthorized.')
    return { userId: user.userId, email: user.email, username: user.username }
  }

  // ──────────────────────────────────────────────
  // POST /api/auth?action=update-profile
  // ──────────────────────────────────────────────
  if (action === 'update-profile' && event.method === 'POST') {
    const authUser = await verifyToken(event)
    if (!authUser) apiError(401, 'Unauthorized.')
    try {
      const { username } = await readBody(event)
      if (!username || username.trim().length < 2) apiError(400, 'Consulting name must be at least 2 characters.')

      const db = await getTursoClient()
      await db.execute({
        sql: 'UPDATE users SET username = ? WHERE id = ?',
        args: [username.trim(), authUser.userId]
      })

      const updatedUser = { id: authUser.userId, email: authUser.email, username: username.trim() }
      const token = await signToken(updatedUser)

      return { token, user: updatedUser }
    } catch (err: any) {
      if (err.statusCode) throw err
      console.error('[Auth] Update profile error:', err.message)
      apiError(500, 'Server error during profile update.')
    }
  }

  // ──────────────────────────────────────────────
  // POST /api/auth?action=change-password
  // ──────────────────────────────────────────────
  if (action === 'change-password' && event.method === 'POST') {
    const authUser = await verifyToken(event)
    if (!authUser) apiError(401, 'Unauthorized.')
    try {
      const { newPassword, confirmPassword } = await readBody(event)
      if (!newPassword) apiError(400, 'New password is required.')
      if (newPassword.length < 6) apiError(400, 'New password must be at least 6 characters.')
      if (confirmPassword && newPassword !== confirmPassword) apiError(400, 'New passwords do not match.')

      const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)

      const db = await getTursoClient()
      await db.execute({
        sql: 'UPDATE users SET password = ? WHERE id = ?',
        args: [hashedNewPassword, authUser.userId]
      })

      return { success: true, message: 'Password updated successfully.' }
    } catch (err: any) {
      if (err.statusCode) throw err
      console.error('[Auth] Change password error:', err.message)
      apiError(500, 'Server error during password change.')
    }
  }

  apiError(400, 'Unknown action.')
})
