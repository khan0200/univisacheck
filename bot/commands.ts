/**
 * bot/commands.ts
 * 
 * Implements Telegram bot slash command handlers and main menu actions.
 */

import { Context } from 'grammy';
import { getUserByTelegramId, disconnectUser } from '../lib/auth';
import { getStudentsByTelegramId, formatStudentCard, refreshStudent } from '../lib/cabinet';
import { getMainMenuKeyboard, getCabinetMenuKeyboard, getAccountMenuKeyboard, getSettingsKeyboard, getVisaTypeKeyboard, getCancelKeyboard } from './keyboards';
import { getLang, setLang, t, Lang } from '../lib/i18n';
import db from '../lib/turso';


// Session Helpers (backed by Turso SQLite)
export async function getSessionState(telegramId: number): Promise<{ state: string; data: any }> {
    try {
        const res = await db.execute({
            sql: 'SELECT state, data FROM bot_sessions WHERE telegram_id = ?',
            args: [telegramId]
        });
        if (res.rows.length === 0) {
            return { state: 'idle', data: {} };
        }
        const row = res.rows[0] as any;
        return {
            state: row.state || 'idle',
            data: row.data ? JSON.parse(row.data) : {}
        };
    } catch {
        return { state: 'idle', data: {} };
    }
}

export async function setSessionState(telegramId: number, state: string, data: any): Promise<void> {
    try {
        await db.execute({
            sql: `
                INSERT INTO bot_sessions (telegram_id, state, data)
                VALUES (?, ?, ?)
                ON CONFLICT(telegram_id) DO UPDATE SET state = excluded.state, data = excluded.data
            `,
            args: [telegramId, state, JSON.stringify(data)]
        });
    } catch (err: any) {
        console.error('[Session DB Error] Failed to write state:', err.message);
    }
}

export async function clearSessionState(telegramId: number): Promise<void> {
    try {
        await db.execute({
            sql: 'DELETE FROM bot_sessions WHERE telegram_id = ?',
            args: [telegramId]
        });
    } catch {}
}

// Helper: build localised menu keyboard for a telegram user
async function getMenuKeyboard(telegramId: number) {
    const user = await getUserByTelegramId(telegramId);
    const lang = await getLang(telegramId);
    return getMainMenuKeyboard(user?.username, lang);
}

/**
 * /start command.
 * Welcomes the user and opens the main menu.
 */
export async function handleStart(ctx: Context) {
    const telegramId = ctx.from?.id || 0;
    await clearSessionState(telegramId);
    
    const lang = await getLang(telegramId);
    let username: string | null = null;
    if (telegramId) {
        const activeUser = await getUserByTelegramId(telegramId);
        if (activeUser) username = activeUser.username;
    }

    await ctx.reply(t('welcome', lang), {
        reply_markup: getMainMenuKeyboard(username, lang)
    });
}

/**
 * /cabinet command.
 * Initiates the cabinet connection flow.
 */
export async function handleCabinetCommand(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const lang = await getLang(telegramId);
    await clearSessionState(telegramId);
    
    const activeUser = await getUserByTelegramId(telegramId);
    if (activeUser) {
        await ctx.reply(t('cabinet_already_linked', lang, { username: activeUser.username }), {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(activeUser.username, lang)
        });
        return;
    }
    
    await setSessionState(telegramId, 'awaiting_email', {});
    await ctx.reply(t('login_title', lang), { parse_mode: 'Markdown' });
}

/**
 * /check command.
 * Initiates a one-off visa check.
 */
export async function handleCheckCommand(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const lang = await getLang(telegramId);
    await setSessionState(telegramId, 'awaiting_check_type', {});
    await ctx.reply(t('check_type_prompt', lang), {
        parse_mode: 'Markdown',
        reply_markup: getVisaTypeKeyboard(lang)
    });
}

/**
 * /help command.
 */
export async function handleHelpCommand(ctx: Context) {
    const telegramId = ctx.from?.id || 0;
    const lang = await getLang(telegramId);
    
    let username: string | null = null;
    if (telegramId) {
        const activeUser = await getUserByTelegramId(telegramId);
        if (activeUser) username = activeUser.username;
    }

    await ctx.reply(t('help', lang), {
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(username, lang)
    });
}

/**
 * ⚙️ Sozlamalar / ⚙️ Settings button.
 * Shows language selection keyboard.
 */
export async function handleSettingsMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const lang = await getLang(telegramId);
    await ctx.reply(t('settings_title', lang), {
        parse_mode: 'Markdown',
        reply_markup: getSettingsKeyboard(lang)
    });
}

/**
 * Handles the "📂 Cabinet" main menu click.
 * Displays all active students categorised by status.
 */
export async function handleCabinetMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const lang = await getLang(telegramId);
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await ctx.reply(t('connect_first', lang));
        return;
    }
    
    await ctx.reply(t('cabinet_categories', lang), {
        parse_mode: 'Markdown',
        reply_markup: getCabinetMenuKeyboard(lang)
    });
}


/**
 * Handles the "⚙ Account" main menu click.
 * Shows connection info and Disconnect button.
 */
export async function handleAccountMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const lang = await getLang(telegramId);
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await ctx.reply(t('account_not_connected', lang), {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: t('cabinet_connect_btn', lang), callback_data: 'account:connect' }]
                ]
            }
        });
        return;
    }
    
    const students = await getStudentsByTelegramId(telegramId);
    const connectedSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '--';
    
    await ctx.reply(
        t('account_info', lang, {
            username: user.username,
            email: user.email,
            date: connectedSince,
            count: students.length
        }),
        {
            parse_mode: 'Markdown',
            reply_markup: getAccountMenuKeyboard(lang)
        }
    );
}
