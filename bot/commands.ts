/**
 * bot/commands.ts
 * 
 * Implements Telegram bot slash command handlers and main menu actions.
 */

import { Context } from 'grammy';
import { getUserByTelegramId, disconnectUser } from '../lib/auth';
import { getStudentsByTelegramId, formatStudentCard, refreshStudent } from '../lib/cabinet';
import { mainMenuKeyboard, accountMenuKeyboard, visaTypeKeyboard, cabinetMenuKeyboard, getMainMenuKeyboard } from './keyboards';
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
        `Koreya visa tekshirish botiga xush kelibsiz! 🇰🇷🤖\n\n` +
        `Imkoniyatlar:\n` +
        `• VisaCheck kabinetini ulash\n` +
        `• Talabalar visa statusini kuzatish\n` +
        `• O'zgarishlar haqida bildirishnoma olish\n` +
        `• Visa statusini tezkor tekshirish\n\n` +
        `Menudan foydalaning.`;
    
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
        await ctx.reply(`✅ Kabinet ulangan: *${activeUser.username}*`, {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(activeUser.username)
        });
        return;
    }
    
    // Start login state machine
    await setSessionState(telegramId, 'awaiting_email', {});
    await ctx.reply('🔒 *Kabinetga kirish*\n\nEmail yoki Consulting nomini kiriting:', {
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
    await ctx.reply('✈️ *Visa turini tanlang*:', {
        parse_mode: 'Markdown',
        reply_markup: visaTypeKeyboard
    });
}

/**
 * /help command.
 */
export async function handleHelpCommand(ctx: Context) {
    const helpText = 
        `ℹ️ *Bot bo'yicha qo'llanma*\n\n` +
        `*Buyruqlar:*\n` +
        `/start - Botni boshlash\n` +
        `/cabinet - Kabinetni ulash\n` +
        `/check - Visani tekshirish\n` +
        `/help - Yordam menyusi\n\n` +
        `*Menyular:*\n` +
        `📂 *Kabinet* - Talabalar ro'yxati\n` +
        `🔍 *Tekshirish* - Visani to'g'ridan-to'g'ri tekshirish\n` +
        `⚙ *Consulting* - Sozlamalar va chiqish\n\n` +
        `Savollar uchun administratorga murojaat qiling.`;
        
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
        await ctx.reply('⚠️ Oldin kabinetni ulang (⚙ Consulting ni ulash orqali).');
        return;
    }
    
    await ctx.reply('📂 *Kategoriyalar*\n\nKerakli bo\'limni tanlang:', {
        parse_mode: 'Markdown',
        reply_markup: cabinetMenuKeyboard
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
            `⚙ *Profilni boshqarish*\n\n` +
            `Holat: 🛑 *Ulanmagan*\n\n` +
            `VisaCheck kabinetini ulash uchun tugmani bosing:`;
            
        const inlineKeyboard = {
            inline_keyboard: [
                [{ text: '🔑 Kabinetni ulash', callback_data: 'account:connect' }]
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
        `⚙ *Consulting ma'lumotlari*\n\n` +
        `👤 *Consulting:* ${user.username}\n` +
        `📧 *Email:* \`${user.email}\`\n` +
        `📅 *Ulangan sana:* ${connectedSince}\n` +
        `🎓 *Talabalar soni:* ${students.length}\n` +
        `🔄 *Holat:* Muvaffaqiyatli ulangan\n\n` +
        `Kabinetni o'chirish uchun quyidagi tugmani bosing:`;
        
    const inlineKeyboard = {
        inline_keyboard: [
            [{ text: '🔴 Chiqish', callback_data: 'account:disconnect' }]
        ]
    };
    
    await ctx.reply(accountText, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
    });
}
