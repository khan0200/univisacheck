// Vercel Serverless Function — /api/auth
// Handles signup, login, and me endpoints.

const db = require('./db');
const bcrypt = require('bcryptjs');
const { signToken, verifyToken, setCors } = require('./auth-helper');

const SALT_ROUNDS = 12;

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const action = req.query.action;

    // ──────────────────────────────────────────────
    // POST /api/auth?action=signup
    // ──────────────────────────────────────────────
    if (action === 'signup' && req.method === 'POST') {
        try {
            const { email, username, password, confirmPassword } = req.body;

            if (!email || !username || !password) {
                return res.status(400).json({ error: 'Email, username and password are required.' });
            }
            if (!validateEmail(email)) {
                return res.status(400).json({ error: 'Invalid email address.' });
            }
            if (username.trim().length < 2) {
                return res.status(400).json({ error: 'Username must be at least 2 characters.' });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters.' });
            }
            if (confirmPassword && password !== confirmPassword) {
                return res.status(400).json({ error: 'Passwords do not match.' });
            }

            // Check duplicate email
            const existing = await db.execute({
                sql: 'SELECT id FROM users WHERE email = ?',
                args: [email.toLowerCase().trim()]
            });
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'An account with this email already exists.' });
            }

            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

            const result = await db.execute({
                sql: 'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
                args: [email.toLowerCase().trim(), username.trim(), hashedPassword]
            });

            const user = {
                id: Number(result.lastInsertRowid),
                email: email.toLowerCase().trim(),
                username: username.trim()
            };

            const token = signToken(user);

            return res.status(201).json({
                token,
                user: { id: user.id, email: user.email, username: user.username }
            });
        } catch (err) {
            console.error('[Auth] Signup error:', err.message);
            return res.status(500).json({ error: 'Server error during signup.' });
        }
    }

    // ──────────────────────────────────────────────
    // POST /api/auth?action=login
    // ──────────────────────────────────────────────
    if (action === 'login' && req.method === 'POST') {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required.' });
            }

            const identifier = email.trim().toLowerCase();
            const result = await db.execute({
                sql: 'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
                args: [identifier, identifier]
            });

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid email/username or password.' });
            }

            const user = result.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            const token = signToken({
                id: Number(user.id),
                email: user.email,
                username: user.username
            });

            return res.status(200).json({
                token,
                user: { id: Number(user.id), email: user.email, username: user.username }
            });
        } catch (err) {
            console.error('[Auth] Login error:', err.message);
            return res.status(500).json({ error: 'Server error during login.' });
        }
    }

    // ──────────────────────────────────────────────
    // GET /api/auth?action=me
    // ──────────────────────────────────────────────
    if (action === 'me' && req.method === 'GET') {
        const user = verifyToken(req);
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }
        return res.status(200).json({
            userId: user.userId,
            email: user.email,
            username: user.username
        });
    }

    // ──────────────────────────────────────────────
    // POST /api/auth?action=update-profile
    // ──────────────────────────────────────────────
    if (action === 'update-profile' && req.method === 'POST') {
        const authUser = verifyToken(req);
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }
        try {
            const { username } = req.body;
            if (!username || username.trim().length < 2) {
                return res.status(400).json({ error: 'Consulting name must be at least 2 characters.' });
            }

            await db.execute({
                sql: 'UPDATE users SET username = ? WHERE id = ?',
                args: [username.trim(), authUser.userId]
            });

            // Sign a fresh token with updated name
            const updatedUser = {
                id: authUser.userId,
                email: authUser.email,
                username: username.trim()
            };
            const token = signToken(updatedUser);

            return res.status(200).json({
                token,
                user: updatedUser
            });
        } catch (err) {
            console.error('[Auth] Update profile error:', err.message);
            return res.status(500).json({ error: 'Server error during profile update.' });
        }
    }

    // ──────────────────────────────────────────────
    // POST /api/auth?action=change-password
    // ──────────────────────────────────────────────
    if (action === 'change-password' && req.method === 'POST') {
        const authUser = verifyToken(req);
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }
        try {
            const { newPassword, confirmPassword } = req.body;
            if (!newPassword) {
                return res.status(400).json({ error: 'New password is required.' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters.' });
            }
            if (confirmPassword && newPassword !== confirmPassword) {
                return res.status(400).json({ error: 'New passwords do not match.' });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

            await db.execute({
                sql: 'UPDATE users SET password = ? WHERE id = ?',
                args: [hashedNewPassword, authUser.userId]
            });

            return res.status(200).json({ success: true, message: 'Password updated successfully.' });
        } catch (err) {
            console.error('[Auth] Change password error:', err.message);
            return res.status(500).json({ error: 'Server error during password change.' });
        }
    }

    return res.status(400).json({ error: 'Unknown action.' });
};
