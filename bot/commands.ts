/**
 * bot/commands.ts
 * 
 * Implements Telegram bot slash command handlers and main menu actions.
 */

import { Context } from 'grammy';
import { getUserByTelegramId, disconnectUser } from '../lib/auth';
import { getStudentsByTelegramId, formatStudentCard, refreshStudent } from '../lib/cabinet';
import { mainMenuKeyboard, accountMenuKeyboard, visaTypeKeyboard, cabinetMenuKeyboard } from './keyboards';
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

/**
 * /start command.
 * Welcomes the user and opens the main menu.
 */
export async function handleStart(ctx: Context) {
    await clearSessionState(ctx.from?.id || 0);
    const welcomeText = 
        `Welcome to *Korea Visa Check* Bot! 🇰🇷🤖\n\n` +
        `This bot allows you to:\n` +
        `• Connect your VisaCheck agency cabinet\n` +
        `• Monitor and synchronize your students' visa statuses\n` +
        `• Get real-time status change notifications\n` +
        `• Run instant one-off visa checks\n\n` +
        `Use the menu below to navigate.`;
    
    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
    });
}

/**
 * /cabinet command.
 * Initiates the cabinet connection flow.
 */
export async function handleCabinetCommand(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    await clearSessionState(telegramId);
    
    // Check if already connected
    const activeUser = await getUserByTelegramId(telegramId);
    if (activeUser) {
        await ctx.reply(`✅ Your account is already connected to: *${activeUser.email}*`, {
            parse_mode: 'Markdown',
            reply_markup: mainMenuKeyboard
        });
        return;
    }
    
    // Start login state machine
    await setSessionState(telegramId, 'awaiting_email', {});
    await ctx.reply('🔒 *Cabinet Login Flow*\n\nPlease enter your cabinet *Email address* or *Consulting name*:', {
        parse_mode: 'Markdown'
    });
}

/**
 * /check command.
 * Initiates a one-off visa check.
 */
export async function handleCheckCommand(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    await setSessionState(telegramId, 'awaiting_check_type', {});
    await ctx.reply('✈️ Select the *Visa application mode*:', {
        parse_mode: 'Markdown',
        reply_markup: visaTypeKeyboard
    });
}

/**
 * /help command.
 */
export async function handleHelpCommand(ctx: Context) {
    const helpText = 
        `ℹ️ *Visa Checker Bot Guide*\n\n` +
        `*Commands:*\n` +
        `/start - Open main menu & welcome message\n` +
        `/cabinet - Connect your VisaCheck account\n` +
        `/check - Perform a manual visa status check\n` +
        `/help - View this help menu\n\n` +
        `*Main Menu Buttons:*\n` +
        `📂 *Cabinet* - View your registered students & refresh individual statuses\n` +
        `🔍 *Check Visa* - Check any visa directly without linking cabinet\n` +
        `🔄 *Refresh All* - Query and refresh all cabinet students at once\n` +
        `⚙ *Account* - Manage connection settings & disconnect account\n\n` +
        `Need help? Contact the consulting administrator.`;
        
    await ctx.reply(helpText, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
    });
}

/**
 * Handles the "📂 Cabinet" main menu click.
 * Displays all active students with individual Refresh buttons.
 */
export async function handleCabinetMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await ctx.reply('⚠️ Please connect your cabinet account first by running /cabinet or selecting ⚙ Account.');
        return;
    }
    
    await ctx.reply('📂 *Cabinet Categories*\n\nSelect a category to view students:', {
        parse_mode: 'Markdown',
        reply_markup: cabinetMenuKeyboard
    });
}

/**
 * Handles the "🔄 Refresh All" main menu click.
 * Syncs and updates status of all students.
 */
export async function handleRefreshAllMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await ctx.reply('⚠️ Please connect your cabinet account first.');
        return;
    }
    
    await ctx.reply('🔄 *Initiating bulk refresh of all your cabinet students...*\nThis might take a moment.', { parse_mode: 'Markdown' });
    
    const students = await getStudentsByTelegramId(telegramId);
    if (students.length === 0) {
        await ctx.reply('📭 No students found in your cabinet to refresh.');
        return;
    }
    
    let updatedCount = 0;
    let changedCount = 0;
    
    // Batch run with a concurrency limit or simple sequential (safe for Vercel timeouts)
    // Run up to 3 parallel checks to optimize speed
    const batchSize = 3;
    for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        await Promise.all(batch.map(async (student) => {
            try {
                const res = await refreshStudent(telegramId, student.passport);
                updatedCount++;
                if (res.success && res.changed && res.student) {
                    changedCount++;
                    // Send notification message
                    const notifyText = formatStudentCard(res.student, true, res.oldStatus);
                    await ctx.api.sendMessage(telegramId, notifyText);
                }
            } catch (err: any) {
                console.error(`[Bulk Refresh] Error on ${student.passport}:`, err.message);
            }
        }));
    }
    
    await ctx.reply(`✅ *Bulk Refresh Complete!*\nChecked ${updatedCount} students. Found ${changedCount} status updates.`, {
        parse_mode: 'Markdown'
    });
}

/**
 * Handles the "⚙ Account" main menu click.
 * Shows connection info and Disconnect button.
 */
export async function handleAccountMenu(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        const welcomeText = 
            `⚙ *Account Management*\n\n` +
            `Status: 🛑 *Not Connected*\n\n` +
            `To connect your existing VisaCheck account, click the button below:`;
            
        const inlineKeyboard = {
            inline_keyboard: [
                [{ text: '🔑 Connect Cabinet', callback_data: 'account:connect' }]
            ]
        };
        await ctx.reply(welcomeText, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
        return;
    }
    
    const students = await getStudentsByTelegramId(telegramId);
    
    const connectedSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '--';
    
    const accountText = 
        `⚙ *Connected Account Details*\n\n` +
        `👤 *Consulting Name:* ${user.username}\n` +
        `📧 *Current Email:* \`${user.email}\`\n` +
        `📅 *Connected Since:* ${connectedSince}\n` +
        `🎓 *Students Count:* ${students.length}\n` +
        `🔄 *Last Connection Refresh:* Connected successfully\n\n` +
        `To unlink your cabinet account from Telegram, press the button below:`;
        
    const inlineKeyboard = {
        inline_keyboard: [
            [{ text: '🔴 Disconnect Account', callback_data: 'account:disconnect' }]
        ]
    };
    
    await ctx.reply(accountText, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
    });
}
