/**
 * bot/handlers.ts
 * 
 * Implements callback query processing and conversational state-machine handlers.
 */

import { Context } from 'grammy';
import { connectUser, disconnectUser } from '../lib/auth';
import { checkStudentVisaStatus } from '../lib/visa';
import { getSessionState, setSessionState, clearSessionState, handleCabinetMenu } from './commands';
import { getStudentCardKeyboard, mainMenuKeyboard, visaTypeKeyboard, cancelKeyboard } from './keyboards';
import { getStatusEmoji, getStatusDescription, refreshStudent, formatStudentCard, getStudentsByTelegramId } from '../lib/cabinet';
import db from '../lib/turso';

// Input Validation Helpers
const PASSPORT_REGEX = /^[A-Z]{2}\d{7}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Main Text Message handler (State Machine).
 * Processes inputs for various conversation flows.
 */
export async function handleTextMessage(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const text = ctx.message?.text?.trim() || '';
    
    // Check if user wants to cancel
    if (text === '❌ Cancel') {
        await clearSessionState(telegramId);
        await ctx.reply('❌ Action cancelled.', {
            reply_markup: mainMenuKeyboard
        });
        return;
    }
    
    // Get session
    const session = await getSessionState(telegramId);
    
    if (session.state === 'idle') {
        // Fallback for unexpected messages
        await ctx.reply('👋 Choose an option from the menu below or send /help to view commands.', {
            reply_markup: mainMenuKeyboard
        });
        return;
    }
    
    // ── Cabinet Connection Flow ──
    if (session.state === 'awaiting_email') {
        if (text.length < 2) {
            await ctx.reply('⚠️ Please enter a valid Email address or Consulting name:');
            return;
        }
        
        await setSessionState(telegramId, 'awaiting_password', { email: text });
        await ctx.reply('🗝 Please enter your cabinet *Password*:\n\n_(Note: Your password is encrypted and stored securely using AES-256)_', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_password') {
        const email = session.data.email;
        await ctx.reply('⌛ *Verifying credentials and connecting account...*', { parse_mode: 'Markdown' });
        
        const connectResult = await connectUser(
            telegramId,
            ctx.from?.username || '',
            ctx.from?.first_name || '',
            ctx.from?.last_name || '',
            email,
            text
        );
        
        if (!connectResult.success) {
            await clearSessionState(telegramId);
            await ctx.reply(`❌ *Connection Failed*\n\n${connectResult.error}`, {
                parse_mode: 'Markdown',
                reply_markup: mainMenuKeyboard
            });
            return;
        }
        
        await clearSessionState(telegramId);
        await ctx.reply('✅ *Connected successfully!*', {
            parse_mode: 'Markdown',
            reply_markup: mainMenuKeyboard
        });
        
        // Immediately sync and show their cabinet
        await handleCabinetMenu(ctx);
        return;
    }
    
    // ── One-Off Manual check flow ──
    if (session.state === 'awaiting_check_passport') {
        if (!PASSPORT_REGEX.test(text)) {
            await ctx.reply('⚠️ Invalid passport format. Expected 2 letters followed by 7 numbers (e.g. AA1234567). Please try again:');
            return;
        }
        
        const visaType = session.data.visaType;
        await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport: text.toUpperCase() });
        await ctx.reply('👤 Please enter the student\'s *Full Name* (in English, matching passport):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_check_name') {
        if (text.length < 2) {
            await ctx.reply('⚠️ Name too short. Please enter the full name:');
            return;
        }
        
        const { visaType, passport } = session.data;
        await setSessionState(telegramId, 'awaiting_check_dob', { visaType, passport, fullName: text.toUpperCase() });
        await ctx.reply('📅 Please enter the student\'s *Date of Birth* (format: YYYY-MM-DD, e.g. 2005-03-18):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_check_dob') {
        if (!DATE_REGEX.test(text)) {
            await ctx.reply('⚠️ Invalid date format. Please use YYYY-MM-DD format (e.g. 2005-03-18):');
            return;
        }
        
        const { visaType, passport, fullName } = session.data;
        const birthday = text;
        
        if (visaType === 'Embassy') {
            await ctx.reply('⌛ *Wait for visa.go.kr portal...*', { parse_mode: 'Markdown' });
            try {
                const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'Embassy', '');
                await clearSessionState(telegramId);
                await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday);
            } catch (err: any) {
                await clearSessionState(telegramId);
                await ctx.reply(`❌ *Visa check failed* due to network or portal error: ${err.message}`, {
                    reply_markup: mainMenuKeyboard
                });
            }
        } else {
            // E-Visa needs application number
            await setSessionState(telegramId, 'awaiting_check_appno', { visaType, passport, fullName, birthday });
            await ctx.reply('📄 Please enter the *E-Visa Application Number* (e.g. 6595150001):', {
                parse_mode: 'Markdown',
                reply_markup: cancelKeyboard
            });
        }
        return;
    }
    
    if (session.state === 'awaiting_check_appno') {
        if (text.length < 5) {
            await ctx.reply('⚠️ Invalid application number. Please enter it again:');
            return;
        }
        
        const { passport, fullName, birthday } = session.data;
        await ctx.reply('⌛ *Wait for visa.go.kr portal...*', { parse_mode: 'Markdown' });
        
        try {
            const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'E-Visa', text);
            await clearSessionState(telegramId);
            await displayCheckResult(ctx, checkRes, passport, 'E-Visa', text, fullName, birthday);
        } catch (err: any) {
            await clearSessionState(telegramId);
            await ctx.reply(`❌ *Visa check failed* due to a network or portal error: ${err.message}`, {
                reply_markup: mainMenuKeyboard
            });
        }
        return;
    }
}

/**
 * Handles all Inline Keyboard Callback Queries.
 */
export async function handleCallbackQuery(ctx: Context) {
    const callbackData = ctx.callbackQuery?.data || '';
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    await ctx.answerCallbackQuery().catch(() => {}); // Answer immediately to remove loading spinner
    
    // ── Individual Refresh Button Click ──
    if (callbackData.startsWith('refresh:')) {
        const passport = callbackData.split(':')[1];
        
        // 1. Send temporary refreshing status message
        const statusMsg = await ctx.reply(`🔄 *Refreshing status for passport ${passport}...*`, { parse_mode: 'Markdown' });
        
        const res = await refreshStudent(telegramId, passport);
        
        // 2. Delete the temporary refreshing status message immediately
        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        
        if (!res.success) {
            await ctx.reply(`❌ Failed to check: ${res.error}`);
            return;
        }
        
        if (res.student) {
            const cardText = formatStudentCard(res.student, res.changed, res.oldStatus);
            const cardMessage = ctx.callbackQuery?.message;
            
            // If it changed, send a brand new message and delete the old card
            if (res.changed) {
                if (cardMessage) {
                    await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
                }
                await ctx.reply(cardText, {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `refresh:${res.student.passport}` }]]
                    }
                });
            } else {
                // If no changes, edit the existing card's text to show the updated checked timestamp
                if (cardMessage) {
                    await ctx.api.editMessageText(ctx.chat!.id, cardMessage.message_id, cardText, {
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `refresh:${res.student.passport}` }]]
                        }
                    }).catch(() => {});
                }
            }
        }
        return;
    }
    
    // ── Account Connection button ──
    if (callbackData === 'account:connect') {
        await clearSessionState(telegramId);
        await setSessionState(telegramId, 'awaiting_email', {});
        await ctx.reply('🔒 *Cabinet Login Flow*\n\nPlease enter your cabinet *Email address* or *Consulting name*:', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // ── Account Disconnect Button Click ──
    if (callbackData === 'account:disconnect') {
        const success = await disconnectUser(telegramId);
        if (success) {
            await ctx.reply('🔌 *Account unlinked successfully.* Your credentials, session tokens, and cache associations have been removed.', {
                parse_mode: 'Markdown',
                reply_markup: mainMenuKeyboard
            });
        } else {
            await ctx.reply('⚠️ Account was not connected.');
        }
        return;
    }
    
    // ── Manual Visa Check Application Mode choice ──
    if (callbackData.startsWith('check_type:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_type') return;
        
        const visaType = callbackData.split(':')[1];
        
        await setSessionState(telegramId, 'awaiting_check_passport', { visaType });
        await ctx.reply('🔍 *Instant Visa Check*\n\nPlease enter the *Passport number* (e.g., AA1234567):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    // ── Cabinet Category Selection ──
    if (callbackData.startsWith('cabinet_tab:')) {
        const tab = callbackData.split(':')[1];
        
        // Fetch all active students
        const students = await getStudentsByTelegramId(telegramId);
        
        // Filter based on tab
        const filtered = students.filter(student => {
            const status = (student.status || '').toLowerCase();
            const isApproved = status.includes('approved') || status.includes('visa used');
            const isCancelled = status.includes('cancel') || status.includes('reject');
            const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');
            
            if (tab === 'pending') {
                return isPending;
            } else if (tab === 'approved') {
                return isApproved;
            } else if (tab === 'cancelled') {
                return isCancelled;
            } else if (tab === 'application') {
                // Application: everything else
                return !isPending && !isCancelled && !isApproved;
            }
            return false;
        });
        
        const categoryTitle = tab.charAt(0).toUpperCase() + tab.slice(1);
        
        if (filtered.length === 0) {
            await ctx.reply(`📭 No students found in the *${categoryTitle}* category.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        await ctx.reply(`📂 *Cabinet - ${categoryTitle}* (${filtered.length} students)`, {
            parse_mode: 'Markdown'
        });
        
        // Display each matching student card
        for (const student of filtered) {
            const cardText = formatStudentCard(student);
            const inlineKeyboard = {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: `refresh:${student.passport}` }]
                ]
            };
            await ctx.reply(cardText, {
                reply_markup: inlineKeyboard
            });
        }
        return;
    }

    // ── Manual Check Refresh Button Click ──
    if (callbackData.startsWith('mrefresh:')) {
        const passport = callbackData.split(':')[1].toUpperCase().trim();
        
        // 1. Send temporary refreshing status message
        const statusMsg = await ctx.reply(`🔄 *Refreshing status for passport ${passport}...*`, { parse_mode: 'Markdown' });
        
        try {
            // 2. Fetch manual check details from database
            const res = await db.execute({
                sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ?',
                args: [passport]
            });
            
            if (res.rows.length === 0) {
                // Delete the status message
                await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
                await ctx.reply(`❌ Failed to check: details not found. Please run a new check using /check.`);
                return;
            }
            
            const row = res.rows[0] as any;
            const fullName = row.fullname;
            const birthday = row.birthday;
            const visaType = row.visa_type;
            const applicationNo = row.application_no || '';
            
            // 3. Query the portal directly
            const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, visaType, applicationNo);
            
            // 4. Delete the temporary refreshing status message
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            
            const cardMessage = ctx.callbackQuery?.message;
            
            if (!checkRes.found || (checkRes.latestStatus || '').toUpperCase() === 'UNKNOWN') {
                if (cardMessage) {
                    await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
                }
                await ctx.reply(`🚫 No result\n\nDouble check your passport number, Fullname, Birthdate`, {
                    reply_markup: mainMenuKeyboard
                });
                return;
            }
            
            const emoji = getStatusEmoji(checkRes.latestStatus);
            const desc = getStatusDescription(checkRes.latestStatus);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => checkRes.latestStatus.toLowerCase().includes(s));
            
            const resultText = 
                `🔍 *Visa Application Status Check*\n\n` +
                `${fullName.toUpperCase()}\n` +
                `${passport.toUpperCase()}\n` +
                `${birthday}\n\n` +
                `✈️ *Visa Type:* ${checkRes.statusOfResidence || checkRes.visaKind || visaType}\n` +
                (visaType === 'E-Visa' ? `🏢 *Invitee:* ${checkRes.invitingCompany || 'N/A'}\n` : '') +
                (visaType === 'E-Visa' ? `📄 *Application Number:* ${applicationNo}\n` : '') +
                `📅 *Application Date:* ${checkRes.latestDate || 'N/A'}\n` +
                `🔄 *Status:* ${emoji} *${checkRes.latestStatus.toUpperCase()}*\n\n` +
                `*Result:* ${desc}\n` +
                (checkRes.rejectionReason ? `\n⚠️ *Reason:* ${checkRes.rejectionReason}\n` : '') +
                (checkRes.pdfUrl && isApproved ? `\n📄 [Download Visa Certificate](${checkRes.pdfUrl})\n` : '');
                
            const currentText = cardMessage?.text || '';
            const changed = !currentText.toLowerCase().includes(checkRes.latestStatus.toLowerCase());
            
            if (changed) {
                if (cardMessage) {
                    await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
                }
                await ctx.reply(resultText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `mrefresh:${passport}` }]]
                    },
                    link_preview_options: { is_disabled: true }
                });
            } else {
                if (cardMessage) {
                    await ctx.api.editMessageText(ctx.chat!.id, cardMessage.message_id, resultText, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `mrefresh:${passport}` }]]
                        },
                        link_preview_options: { is_disabled: true }
                    }).catch(() => {});
                }
            }
        } catch (err: any) {
            // Delete the status message
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            await ctx.reply(`❌ *Visa check failed* due to network or portal error: ${err.message}`);
        }
        return;
    }
}

/**
 * Helper to display the manual visa check result back to the user.
 */
async function displayCheckResult(
    ctx: Context,
    result: any,
    passport: string,
    visaType: string,
    applicationNo: string,
    fullName: string,
    birthday: string
) {
    if (!result.found || (result.latestStatus || '').toUpperCase() === 'UNKNOWN') {
        await ctx.reply(
            `🚫 No result\n\nDouble check your passport number, Fullname, Birthdate`,
            {
                reply_markup: mainMenuKeyboard
            }
        );
        return;
    }
    
    // Save manual check details in database
    try {
        await db.execute({
            sql: `
                INSERT INTO bot_manual_refreshes (passport, fullname, birthday, visa_type, application_no, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(passport) DO UPDATE SET
                    fullname = excluded.fullname,
                    birthday = excluded.birthday,
                    visa_type = excluded.visa_type,
                    application_no = excluded.application_no,
                    updated_at = datetime('now')
            `,
            args: [
                passport.toUpperCase().trim(),
                fullName.toUpperCase().trim(),
                birthday.trim(),
                visaType,
                applicationNo
            ]
        });
    } catch (err: any) {
        console.error('[Manual Check Database Save Error]:', err.message);
    }
    
    const emoji = getStatusEmoji(result.latestStatus);
    const desc = getStatusDescription(result.latestStatus);
    const isApproved = ['approved', 'visa used', 'issued'].some(s => result.latestStatus.toLowerCase().includes(s));
    
    const resultText = 
        `🔍 *Visa Application Status Check*\n\n` +
        `${fullName.toUpperCase()}\n` +
        `${passport.toUpperCase()}\n` +
        `${birthday}\n\n` +
        `✈️ *Visa Type:* ${result.statusOfResidence || result.visaKind || visaType}\n` +
        (visaType === 'E-Visa' ? `🏢 *Invitee:* ${result.invitingCompany || 'N/A'}\n` : '') +
        (visaType === 'E-Visa' ? `📄 *Application Number:* ${applicationNo}\n` : '') +
        `📅 *Application Date:* ${result.latestDate || 'N/A'}\n` +
        `🔄 *Status:* ${emoji} *${result.latestStatus.toUpperCase()}*\n\n` +
        `*Result:* ${desc}\n` +
        (result.rejectionReason ? `\n⚠️ *Reason:* ${result.rejectionReason}\n` : '') +
        (result.pdfUrl && isApproved ? `\n📄 [Download Visa Certificate](${result.pdfUrl})\n` : '');
        
    await ctx.reply(resultText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }]]
        },
        link_preview_options: { is_disabled: true }
    });
}
