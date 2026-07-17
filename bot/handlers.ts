/**
 * bot/handlers.ts
 * 
 * Implements callback query processing and conversational state-machine handlers.
 */

import { Context, InputFile } from 'grammy';
import { connectUser, disconnectUser } from '../lib/auth';
import { checkStudentVisaStatus, downloadStudentVisaPdf } from '../lib/visa';
import { getSessionState, setSessionState, clearSessionState, handleCabinetMenu } from './commands';
import { getStudentCardKeyboard, mainMenuKeyboard, visaTypeKeyboard, cancelKeyboard } from './keyboards';
import { getStatusEmoji, getStatusDescription, refreshStudent, formatStudentCard, getStudentsByTelegramId, formatLastChecked } from '../lib/cabinet';
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
    if (text === '❌ Bekor qilish') {
        await clearSessionState(telegramId);
        await ctx.reply('❌ Bekor qilindi.', {
            reply_markup: mainMenuKeyboard
        });
        return;
    }
    
    // Get session
    const session = await getSessionState(telegramId);
    
    if (session.state === 'idle') {
        // Fallback for unexpected messages
        await ctx.reply('👋 Menudan bo\'limni tanlang yoki /help yuboring.', {
            reply_markup: mainMenuKeyboard
        });
        return;
    }
    
    // ── Cabinet Connection Flow ──
    if (session.state === 'awaiting_email') {
        if (text.length < 2) {
            await ctx.reply('⚠️ Email yoki konsaltig nomini kiriting:');
            return;
        }
        
        await setSessionState(telegramId, 'awaiting_password', { email: text });
        await ctx.reply('🗝 Parolni kiriting:', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_password') {
        const email = session.data.email;
        await ctx.reply('⌛ *Tekshirilmoqda...*', { parse_mode: 'Markdown' });
        
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
            await ctx.reply(`❌ *Xatolik*\n\n${connectResult.error}`, {
                parse_mode: 'Markdown',
                reply_markup: mainMenuKeyboard
            });
            return;
        }
        
        await clearSessionState(telegramId);
        await ctx.reply('✅ *Muvaffaqiyatli ulindi!*', {
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
            await ctx.reply('⚠️ Pasport xato. Misol: AA1234567. Qaytadan kiriting:');
            return;
        }
        
        const visaType = session.data.visaType;
        const passport = text.toUpperCase();
        
        // Search if we have matching student details in our CRM database
        try {
            const dbRes = await db.execute({
                sql: `
                    SELECT fullname, birthday, visa_type
                    FROM students
                    WHERE passport = ? AND deletedAt IS NULL
                    ORDER BY createdAt DESC
                    LIMIT 1
                `,
                args: [passport]
            });
            
            if (dbRes.rows.length > 0) {
                const row = dbRes.rows[0] as any;
                const dbName = row.fullname || row.fullName || '';
                const dbDob = row.birthday || '';
                
                if (dbName && dbDob) {
                    await setSessionState(telegramId, 'awaiting_check_autofill_choice', {
                        visaType,
                        passport,
                        autofill: { fullName: dbName, birthday: dbDob }
                    });
                    
                    const inlineKeyboard = {
                        inline_keyboard: [
                            [{ text: `${dbName}`, callback_data: 'autofill:yes' }],
                            [{ text: '👤 Qo\'lda kiritish', callback_data: 'autofill:no' }]
                        ]
                    };
                    
                    await ctx.reply(
                        `🔍 *Ma'lumot topildi*\n\n` +
                        `Pasport *${passport}* bo'yicha talaba topildi. Bu shu talabami?`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: inlineKeyboard
                        }
                    );
                    return;
                }
            }
        } catch (dbErr: any) {
            console.error('[Autofill DB Search Error]:', dbErr.message);
        }
        
        await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
        await ctx.reply('👤 Talabaning *Ism-familiyasi*ni kiriting (inglizcha, pasportdagidek):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_check_name') {
        if (text.length < 2) {
            await ctx.reply('⚠️ Ism juda qisqa. To\'liq kiriting:');
            return;
        }
        
        const { visaType, passport } = session.data;
        await setSessionState(telegramId, 'awaiting_check_dob', { visaType, passport, fullName: text.toUpperCase() });
        await ctx.reply('📅 Talabaning *Tug\'ilgan kuni* (format: YYYY-MM-DD, misol: 2005-03-18):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    if (session.state === 'awaiting_check_dob') {
        if (!DATE_REGEX.test(text)) {
            await ctx.reply('⚠️ Sana xato. Format: YYYY-MM-DD (misol: 2005-03-18):');
            return;
        }
        
        const { visaType, passport, fullName } = session.data;
        const birthday = text;
        
        if (visaType === 'Embassy') {
            await ctx.reply('⌛ *Kutib turing...*', { parse_mode: 'Markdown' });
            try {
                const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'Embassy', '');
                await clearSessionState(telegramId);
                await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday);
            } catch (err: any) {
                await clearSessionState(telegramId);
                await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
                    reply_markup: mainMenuKeyboard
                });
            }
        } else {
            // E-Visa needs application number
            await setSessionState(telegramId, 'awaiting_check_appno', { visaType, passport, fullName, birthday });
            await ctx.reply('📄 E-Visa ariza raqamini kiriting (misol: 6595150001):', {
                parse_mode: 'Markdown',
                reply_markup: cancelKeyboard
            });
        }
        return;
    }
    
    if (session.state === 'awaiting_check_appno') {
        if (text.length < 5) {
            await ctx.reply('⚠️ Ariza raqami xato. Qaytadan kiriting:');
            return;
        }
        
        const { passport, fullName, birthday } = session.data;
        await ctx.reply('⌛ *Kutib turing...*', { parse_mode: 'Markdown' });
        
        try {
            const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'E-Visa', text);
            await clearSessionState(telegramId);
            await displayCheckResult(ctx, checkRes, passport, 'E-Visa', text, fullName, birthday);
        } catch (err: any) {
            await clearSessionState(telegramId);
            await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
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
        const statusMsg = await ctx.reply(`🔄 *Pasport ${passport} yangilanmoqda...*`, { parse_mode: 'Markdown' });
        
        const res = await refreshStudent(telegramId, passport);
        
        // 2. Delete the temporary refreshing status message immediately
        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        
        if (!res.success) {
            await ctx.reply(`❌ Yangilash xatosi: ${res.error}`);
            return;
        }
        
        if (res.student) {
            const cardText = formatStudentCard(res.student, res.changed, res.oldStatus);
            const cardMessage = ctx.callbackQuery?.message;
            const isApproved = ['approved', 'visa used', 'issued'].some(s => (res.student?.status || '').toLowerCase().includes(s));
            
            const inlineKeyboard = {
                inline_keyboard: isApproved
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${res.student.passport}` }],
                        [{ text: '📄 Sertifikatni yuklash', callback_data: `download_pdf:${res.student.passport}` }]
                      ]
                    : [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${res.student.passport}` }]
                      ]
            };
            
            // If it changed, send a brand new message and delete the old card
            if (res.changed) {
                if (cardMessage) {
                    await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
                }
                await ctx.reply(cardText, {
                    reply_markup: inlineKeyboard
                });
            } else {
                // If no changes, edit the existing card's text to show the updated checked timestamp
                if (cardMessage) {
                    await ctx.api.editMessageText(ctx.chat!.id, cardMessage.message_id, cardText, {
                        reply_markup: inlineKeyboard
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
        await ctx.reply('🔒 *Kabinetga kirish*\n\nEmail yoki konsaltig nomini kiriting:', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // ── Account Disconnect Button Click ──
    if (callbackData === 'account:disconnect') {
        const success = await disconnectUser(telegramId);
        if (success) {
            await ctx.reply('🔌 *Kabinet o\'chirildi.*', {
                parse_mode: 'Markdown',
                reply_markup: mainMenuKeyboard
            });
        } else {
            await ctx.reply('⚠️ Profil ulanmagan.');
        }
        return;
    }
    
    // ── Manual Visa Check Application Mode choice ──
    if (callbackData.startsWith('check_type:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_type') return;
        
        const visaType = callbackData.split(':')[1];
        
        await setSessionState(telegramId, 'awaiting_check_passport', { visaType });
        await ctx.reply('🔍 *Tezkor tekshirish*\n\nPasport raqamini kiriting (misol: AA1234567):', {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
        return;
    }
    
    // ── Autofill Choice selection ──
    if (callbackData.startsWith('autofill:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_autofill_choice') return;
        
        const choice = callbackData.split(':')[1];
        
        // Remove the choice inline keyboard to clean up chat
        const cardMessage = ctx.callbackQuery?.message;
        if (cardMessage) {
            await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
        }
        
        if (choice === 'yes') {
            const { passport, visaType, autofill } = session.data;
            
            await setSessionState(telegramId, 'awaiting_check_autofill_confirm', {
                passport,
                visaType,
                fullName: autofill.fullName,
                birthday: autofill.birthday
            });
            
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Ha', callback_data: 'autofill_confirm:yes' },
                        { text: '❌ Yo\'q', callback_data: 'autofill_confirm:no' }
                    ]
                ]
            };
            
            await ctx.reply(
                `🔍 *Ma'lumotlarni tekshiring*\n\n` +
                `👤 *Ism:* ${autofill.fullName}\n` +
                `📅 *Tug'ilgan sana:* ${autofill.birthday}\n` +
                `✈️ *Visa turi:* ${visaType}\n\n` +
                `*Ma'lumotlar to'g'rimi?*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: inlineKeyboard
                }
            );
        } else {
            // User chose manual entry
            const { passport, visaType } = session.data;
            await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
            await ctx.reply('👤 Talabaning *Ism-familiyasi*ni kiriting (inglizcha, pasportdagidek):', {
                parse_mode: 'Markdown',
                reply_markup: cancelKeyboard
            });
        }
        return;
    }
    
    // ── Autofill Confirm selection ──
    if (callbackData.startsWith('autofill_confirm:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_autofill_confirm') return;
        
        const confirm = callbackData.split(':')[1];
        
        // Remove the confirm inline keyboard
        const cardMessage = ctx.callbackQuery?.message;
        if (cardMessage) {
            await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
        }
        
        const { passport, visaType, fullName, birthday } = session.data;
        
        if (confirm === 'yes') {
            if (visaType === 'Embassy') {
                await ctx.reply('⌛ *Kutib turing...*', { parse_mode: 'Markdown' });
                try {
                    const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'Embassy', '');
                    await clearSessionState(telegramId);
                    await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday);
                } catch (err: any) {
                    await clearSessionState(telegramId);
                    await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
                        reply_markup: mainMenuKeyboard
                    });
                }
            } else {
                // E-Visa track: prompt for application number (do NOT load it automatically)
                await setSessionState(telegramId, 'awaiting_check_appno', { visaType, passport, fullName, birthday });
                await ctx.reply('📄 E-Visa ariza raqamini kiriting (misol: 6595150001):', {
                    parse_mode: 'Markdown',
                    reply_markup: cancelKeyboard
                });
            }
        } else {
            // User rejected confirm
            await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
            await ctx.reply('👤 Talabaning *Ism-familiyasi*ni kiriting (inglizcha, pasportdagidek):', {
                parse_mode: 'Markdown',
                reply_markup: cancelKeyboard
            });
        }
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
        const uzCategoryTitle = tab === 'pending' ? 'Kutilmoqda' : tab === 'approved' ? 'Tasdiqlandi' : tab === 'cancelled' ? 'Rad etildi' : 'Arizalar';
        
        if (filtered.length === 0) {
            await ctx.reply(`📭 Bo'limda talabalar topilmadi.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        await ctx.reply(`📂 *Kabinet - ${uzCategoryTitle}* (${filtered.length} ta talaba)`, {
            parse_mode: 'Markdown'
        });
        
        // Display each matching student card
        for (const student of filtered) {
            const cardText = formatStudentCard(student);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => (student.status || '').toLowerCase().includes(s));
            const inlineKeyboard = {
                inline_keyboard: isApproved
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${student.passport}` }],
                        [{ text: '📄 Sertifikatni yuklash', callback_data: `download_pdf:${student.passport}` }]
                      ]
                    : [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${student.passport}` }]
                      ]
            };
            await ctx.reply(cardText, {
                reply_markup: inlineKeyboard
            });
        }
        return;
    }

    // ── Download Certificate PDF Button Click ──
    if (callbackData.startsWith('download_pdf:')) {
        const passport = callbackData.split(':')[1].toUpperCase().trim();
        const progressMsg = await ctx.reply(`⏳ *Sertifikat yuklab olinmoqda...*\n_Iltimos kutib turing, visa.go.kr portaliga so'rov yuborilmoqda..._`, { parse_mode: 'Markdown' });
        
        try {
            // Find student details from database
            let fullName = '';
            let birthday = '';
            let visaType = 'Embassy';
            let applicationNo = '';
            let pdfUrl = '';
            
            // 1. Search CRM students
            const crmRes = await db.execute({
                sql: 'SELECT * FROM students WHERE passport = ? AND deletedAt IS NULL LIMIT 1',
                args: [passport]
            });
            
            if (crmRes.rows.length > 0) {
                const row = crmRes.rows[0] as any;
                fullName = row.fullName || row.fullname || '';
                birthday = row.birthday || '';
                visaType = row.visaType || row.visa_type || 'Embassy';
                applicationNo = row.applicationNo || row.application_no || '';
                pdfUrl = row.pdfUrl || '';
            } else {
                // 2. Search manual refreshes
                const manualRes = await db.execute({
                    sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ? LIMIT 1',
                    args: [passport]
                });
                
                if (manualRes.rows.length > 0) {
                    const row = manualRes.rows[0] as any;
                    fullName = row.fullname || '';
                    birthday = row.birthday || '';
                    visaType = row.visa_type || 'Embassy';
                    applicationNo = row.application_no || '';
                    pdfUrl = '';
                }
            }
            
            if (!fullName || !birthday) {
                await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
                await ctx.reply(`❌ Talaba ma'lumotlari topilmadi. Avval statusni tekshiring.`);
                return;
            }
            
            const pdfRes = await downloadStudentVisaPdf(passport, fullName, birthday, visaType, applicationNo, pdfUrl);
            
            // Delete progress message
            await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
            
            // Reply with document
            await ctx.replyWithDocument(new InputFile(pdfRes.buffer, pdfRes.filename), {
                caption: `📄 *Koreya vizasi sertifikati* (${passport})`,
                parse_mode: 'Markdown'
            });
        } catch (err: any) {
            await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
            await ctx.reply(`❌ *Sertifikatni yuklab bo'lmadi:* ${err.message}`);
        }
        return;
    }

    // ── Manual Check Refresh Button Click ──
    if (callbackData.startsWith('mrefresh:')) {
        const passport = callbackData.split(':')[1].toUpperCase().trim();
        
        // 1. Send temporary refreshing status message
        const statusMsg = await ctx.reply(`🔄 *Pasport raqami ${passport} yangilanmoqda...*`, { parse_mode: 'Markdown' });
        
        try {
            // 2. Fetch manual check details from database
            const res = await db.execute({
                sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ?',
                args: [passport]
            });
            
            if (res.rows.length === 0) {
                // Delete the status message
                await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
                await ctx.reply(`❌ Pasport topilmadi. Qaytadan /check orqali qidiring.`);
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
                await ctx.reply(`🚫 Natija yo'q\n\nPasport, Ism va Tug'ilgan kunni tekshiring`, {
                    reply_markup: mainMenuKeyboard
                });
                return;
            }
            
            const emoji = getStatusEmoji(checkRes.latestStatus);
            const desc = getStatusDescription(checkRes.latestStatus);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => checkRes.latestStatus.toLowerCase().includes(s));
            
            const checkedStr = formatLastChecked(new Date().toISOString());
            const resultText = 
                `🔍 *Visa statusini tekshirish*\n\n` +
                `${fullName.toUpperCase()}\n` +
                `${passport.toUpperCase()}\n` +
                `${birthday}\n\n` +
                `✈️ *Visa turi:* ${checkRes.statusOfResidence || checkRes.visaKind || visaType}\n` +
                (visaType === 'E-Visa' ? `🏢 *Hamkor:* ${checkRes.invitingCompany || 'N/A'}\n` : '') +
                (visaType === 'E-Visa' ? `📄 *Ariza raqami:* ${applicationNo}\n` : '') +
                `📅 *Topshirilgan sana:* ${checkRes.latestDate || 'N/A'}\n` +
                `🔄 *Holati:* ${emoji} *${checkRes.latestStatus.toUpperCase()}*\n` +
                `Tekshirildi: ${checkedStr}\n\n` +
                `*Natija:* ${desc}\n` +
                (checkRes.rejectionReason ? `\n⚠️ *Sababi:* ${checkRes.rejectionReason}\n` : '') +
                (checkRes.pdfUrl && isApproved ? `\n📄 [Visa sertifikatini yuklash](${checkRes.pdfUrl})\n` : '');
                
            const currentText = cardMessage?.text || '';
            const changed = !currentText.toLowerCase().includes(checkRes.latestStatus.toLowerCase());
            
            const inlineKeyboard = {
                inline_keyboard: isApproved
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport}` }],
                        [{ text: '📄 Sertifikatni yuklash', callback_data: `download_pdf:${passport}` }]
                      ]
                    : [
                        [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport}` }]
                      ]
            };
            
            if (changed) {
                if (cardMessage) {
                    await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
                }
                await ctx.reply(resultText, {
                    parse_mode: 'Markdown',
                    reply_markup: inlineKeyboard,
                    link_preview_options: { is_disabled: true }
                });
            } else {
                if (cardMessage) {
                    await ctx.api.editMessageText(ctx.chat!.id, cardMessage.message_id, resultText, {
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard,
                        link_preview_options: { is_disabled: true }
                    }).catch(() => {});
                }
            }
        } catch (err: any) {
            // Delete the status message
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`);
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
            `🚫 Natija yo'q\n\nPasport, Ism va Tug'ilgan kunni tekshiring`,
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
    
    const checkedStr = formatLastChecked(new Date().toISOString());
    const resultText = 
        `🔍 *Visa statusini tekshirish*\n\n` +
        `${fullName.toUpperCase()}\n` +
        `${passport.toUpperCase()}\n` +
        `${birthday}\n\n` +
        `✈️ *Visa turi:* ${result.statusOfResidence || result.visaKind || visaType}\n` +
        (visaType === 'E-Visa' ? `🏢 *Hamkor:* ${result.invitingCompany || 'N/A'}\n` : '') +
        (visaType === 'E-Visa' ? `📄 *Ariza raqami:* ${applicationNo}\n` : '') +
        `📅 *Topshirilgan sana:* ${result.latestDate || 'N/A'}\n` +
        `🔄 *Holati:* ${emoji} *${result.latestStatus.toUpperCase()}*\n` +
        `Tekshirildi: ${checkedStr}\n\n` +
        `*Natija:* ${desc}\n` +
        (result.rejectionReason ? `\n⚠️ *Sababi:* ${result.rejectionReason}\n` : '') +
        (result.pdfUrl && isApproved ? `\n📄 [Visa sertifikatini yuklash](${result.pdfUrl})\n` : '');
        
    const inlineKeyboard = {
        inline_keyboard: isApproved
            ? [
                [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }],
                [{ text: '📄 Sertifikatni yuklash', callback_data: `download_pdf:${passport.toUpperCase().trim()}` }]
              ]
            : [
                [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }]
              ]
    };

    await ctx.reply(resultText, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard,
        link_preview_options: { is_disabled: true }
    });
}
