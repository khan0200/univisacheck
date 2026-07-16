/**
 * lib/auth.ts
 * 
 * Handles user authentication, Telegram connection, and session renewal.
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
 * Validates cabinet credentials and links the Telegram user to their cabinet account.
 * Encrypts the password and generates an initial JWT session token.
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
        
        // Generate JWT session
        const sessionToken = signToken({
            id: Number(user.id),
            email: user.email,
            username: user.username
        });
        
        // Encrypt password for auto-login later
        const encryptedPassword = encrypt(passwordInput);
        
        // Save connection state in the database
        await db.execute({
            sql: `
                UPDATE users 
                SET telegram_id = ?, 
                    telegram_username = ?, 
                    first_name = ?, 
                    last_name = ?, 
                    encrypted_password = ?, 
                    session = ?, 
                    updated_at = datetime('now')
                WHERE id = ?
            `,
            args: [
                telegramId,
                telegramUsername || '',
                firstName || '',
                lastName || '',
                encryptedPassword,
                sessionToken,
                user.id
            ]
        });
        
        // Also update any matching students cached in Turso with the telegram_user_id
        await db.execute({
            sql: 'UPDATE students SET telegram_user_id = ? WHERE userId = ?',
            args: [telegramId, user.id]
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
 * Disconnects a Telegram user from their cabinet account.
 * Clears saved telegram session, credentials, and sets student association to null.
 */
export async function disconnectUser(telegramId: number): Promise<boolean> {
    try {
        // Find if user is connected
        const userResult = await db.execute({
            sql: 'SELECT id FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (userResult.rows.length === 0) {
            return false;
        }
        
        const userId = userResult.rows[0].id;
        
        // Clear telegram data in users table
        await db.execute({
            sql: `
                UPDATE users 
                SET telegram_id = NULL,
                    telegram_username = NULL,
                    first_name = NULL,
                    last_name = NULL,
                    encrypted_password = NULL,
                    session = NULL,
                    updated_at = datetime('now')
                WHERE id = ?
            `,
            args: [userId]
        });
        
        // Remove telegram_user_id link from students (student data remains in the cabinet)
        await db.execute({
            sql: 'UPDATE students SET telegram_user_id = NULL WHERE userId = ?',
            args: [userId]
        });
        
        return true;
    } catch (err: any) {
        console.error('[Auth Service] Disconnect error:', err.message);
        return false;
    }
}

/**
 * Resolves a valid JWT session for a Telegram user.
 * Checks if the existing session is valid, and if not, automatically signs a new one.
 */
export async function getValidSession(telegramId: number): Promise<string | null> {
    try {
        const result = await db.execute({
            sql: 'SELECT id, email, username, session FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const user = result.rows[0] as any;
        const currentSession = user.session;
        
        if (currentSession) {
            try {
                // Verify if token is still valid
                jwt.verify(currentSession, JWT_SECRET);
                return currentSession;
            } catch (jwtErr) {
                // Token is expired or invalid, let's issue a new one automatically
                console.log(`[Auth Service] Session expired for user ${user.email}. Re-signing token.`);
            }
        }
        
        // Generate a new valid JWT token
        const newSessionToken = signToken({
            id: Number(user.id),
            email: user.email,
            username: user.username
        });
        
        // Save the new session token in the database
        await db.execute({
            sql: "UPDATE users SET session = ?, updated_at = datetime('now') WHERE id = ?",
            args: [newSessionToken, user.id]
        });
        
        return newSessionToken;
    } catch (err: any) {
        console.error('[Auth Service] Session verification/renewal error:', err.message);
        return null;
    }
}

/**
 * Gets a connected user record by their Telegram ID.
 */
export async function getUserByTelegramId(telegramId: number): Promise<BotUser | null> {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const user = result.rows[0] as any;
        return {
            id: Number(user.id),
            email: user.email,
            username: user.username,
            telegram_id: Number(user.telegram_id),
            telegram_username: user.telegram_username,
            first_name: user.first_name,
            last_name: user.last_name,
            session: user.session,
            createdAt: user.createdAt
        };
    } catch (err: any) {
        console.error('[Auth Service] Get user by telegram ID error:', err.message);
        return null;
    }
}
