/**
 * lib/auth.ts
 * 
 * Handles user authentication, Telegram connection, and session renewal.
 * 
 * Cabinet ↔ Telegram relationship is stored in `cabinet_subscribers`:
 *   - One cabinet (users.id) → many telegram_ids
 *   - One telegram_id → one cabinet at a time (UNIQUE constraint)
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './turso';
import { encrypt, decrypt } from './encryption';
import { signToken, JWT_SECRET } from '../api/auth-helper';

export interface BotUser {
    id: number;
    email: string;
    username: string;
    telegram_id: number | null;
    telegram_username: string | null;
    first_name: string | null;
    last_name: string | null;
    session: string | null;
    createdAt: string;
}

/**
 * Validates cabinet credentials and links the Telegram user to the cabinet.
 * Uses cabinet_subscribers so multiple Telegram users can share one cabinet.
 * INSERT OR REPLACE on telegram_id means if this Telegram account was
 * previously linked to a different cabinet it is silently re-assigned.
 */
export async function connectUser(
    telegramId: number,
    telegramUsername: string | null,
    firstName: string | null,
    lastName: string | null,
    emailInput: string,
    passwordInput: string
): Promise<{ success: boolean; error?: string; user?: BotUser }> {
    try {
        const email = emailInput.trim().toLowerCase();
        
        // Find existing cabinet user by email or username
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
            args: [email, email]
        });
        
        if (result.rows.length === 0) {
            return { success: false, error: 'Account not found. Please register on the website first.' };
        }
        
        const user = result.rows[0] as any;
        
        // Verify password
        const passwordMatch = await bcrypt.compare(passwordInput, user.password);
        if (!passwordMatch) {
            return { success: false, error: 'Invalid password. Please check your credentials.' };
        }
        
        // Generate JWT session for this subscriber
        const sessionToken = signToken({
            id: Number(user.id),
            email: user.email,
            username: user.username
        });

        // Ensure cabinet_subscribers table exists
        await db.execute({
            sql: `CREATE TABLE IF NOT EXISTS cabinet_subscribers (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                cabinet_id       INTEGER NOT NULL,
                telegram_id      INTEGER NOT NULL,
                telegram_username TEXT,
                first_name       TEXT,
                last_name        TEXT,
                session          TEXT,
                connected_at     TEXT DEFAULT (datetime('now')),
                UNIQUE(telegram_id)
            )`,
            args: []
        });

        // INSERT OR REPLACE: if this telegram_id was linked elsewhere, re-assign it.
        // Multiple different telegram_ids can share the same cabinet_id.
        await db.execute({
            sql: `
                INSERT INTO cabinet_subscribers
                    (cabinet_id, telegram_id, telegram_username, first_name, last_name, session, connected_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(telegram_id) DO UPDATE SET
                    cabinet_id       = excluded.cabinet_id,
                    telegram_username = excluded.telegram_username,
                    first_name       = excluded.first_name,
                    last_name        = excluded.last_name,
                    session          = excluded.session,
                    connected_at     = datetime('now')
            `,
            args: [
                Number(user.id),
                telegramId,
                telegramUsername || '',
                firstName || '',
                lastName || '',
                sessionToken
            ]
        });
        
        return {
            success: true,
            user: {
                id: Number(user.id),
                email: user.email,
                username: user.username,
                telegram_id: telegramId,
                telegram_username: telegramUsername,
                first_name: firstName,
                last_name: lastName,
                session: sessionToken,
                createdAt: user.createdAt
            }
        };
    } catch (err: any) {
        console.error('[Auth Service] Connect user error:', err.message);
        return { success: false, error: 'Internal server error during connection.' };
    }
}

/**
 * Disconnects a single Telegram user from whichever cabinet they are linked to.
 * Other subscribers of the same cabinet are NOT affected.
 */
export async function disconnectUser(telegramId: number): Promise<boolean> {
    try {
        const result = await db.execute({
            sql: 'DELETE FROM cabinet_subscribers WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        // rowsAffected may be 0 if the user was already disconnected
        return true;
    } catch (err: any) {
        console.error('[Auth Service] Disconnect error:', err.message);
        return false;
    }
}

/**
 * Resolves a valid JWT session for a Telegram subscriber.
 * Reads/writes the session field from cabinet_subscribers.
 */
export async function getValidSession(telegramId: number): Promise<string | null> {
    try {
        const result = await db.execute({
            sql: `
                SELECT cs.session, u.id, u.email, u.username
                FROM cabinet_subscribers cs
                JOIN users u ON u.id = cs.cabinet_id
                WHERE cs.telegram_id = ?
            `,
            args: [telegramId]
        });
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0] as any;
        const currentSession = row.session;
        
        if (currentSession) {
            try {
                jwt.verify(currentSession, JWT_SECRET);
                return currentSession;
            } catch (jwtErr) {
                console.log(`[Auth Service] Session expired for user ${row.email}. Re-signing token.`);
            }
        }
        
        // Re-issue a fresh token
        const newSessionToken = signToken({
            id: Number(row.id),
            email: row.email,
            username: row.username
        });
        
        await db.execute({
            sql: `UPDATE cabinet_subscribers SET session = ? WHERE telegram_id = ?`,
            args: [newSessionToken, telegramId]
        });
        
        return newSessionToken;
    } catch (err: any) {
        console.error('[Auth Service] Session verification/renewal error:', err.message);
        return null;
    }
}

/**
 * Gets the cabinet user record for a given Telegram subscriber.
 * Returns null if this Telegram ID is not connected to any cabinet.
 */
export async function getUserByTelegramId(telegramId: number): Promise<BotUser | null> {
    try {
        const result = await db.execute({
            sql: `
                SELECT u.*, cs.telegram_id, cs.telegram_username,
                       cs.first_name, cs.last_name, cs.session
                FROM cabinet_subscribers cs
                JOIN users u ON u.id = cs.cabinet_id
                WHERE cs.telegram_id = ?
            `,
            args: [telegramId]
        });
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0] as any;
        return {
            id: Number(row.id),
            email: row.email,
            username: row.username,
            telegram_id: Number(row.telegram_id),
            telegram_username: row.telegram_username,
            first_name: row.first_name,
            last_name: row.last_name,
            session: row.session,
            createdAt: row.createdAt
        };
    } catch (err: any) {
        console.error('[Auth Service] Get user by telegram ID error:', err.message);
        return null;
    }
}



