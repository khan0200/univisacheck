/**
 * bot/handlers.ts
 * 
 * Implements callback query processing and conversational state-machine handlers.
 */

import { Context, InputFile } from 'grammy';
import { connectUser, disconnectUser, getUserByTelegramId } from '../lib/auth';
import { checkStudentVisaStatus, downloadStudentVisaPdf } from '../lib/visa';
import { getSessionState, setSessionState, clearSessionState, handleCabinetMenu } from './commands';
import { getStudentCardKeyboard, mainMenuKeyboard, visaTypeKeyboard, cancelKeyboard, getMainMenuKeyboard } from './keyboards';
import { getStatusEmoji, getStatusDescription, refreshStudent, formatStudentCard, getStudentsByTelegramId, formatLastChecked } from '../lib/cabinet';
import db from '../lib/turso';

// Input Validation Helpers
const PASSPORT_REGEX = /^[A-Z]{2}\d{7}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function getMenuKeyboard(telegramId: number) {
    const user = await getUserByTelegramId(telegramId);
    return getMainMenuKeyboard(user?.username);
}


/**
 * Main Text Message handler (State Machine).
 * Processes inputs for various conversation flows.
 */
export async function handleTextMessage(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const text = ctx.message?.text?.trim() || '';
    
    // Check if user wants to cancel
    if (text === '<Ortga') {
        await clearSessionState(telegramId);
        return;
    }
    
    // Get session
    const session = await getSessionState(telegramId);
    
    if (session.state === 'idle') {
        // Fallback for unexpected messages
        await ctx.reply('👋 Menudan bo\'limni tanlang yoki /help yuboring.', {
            reply_markup: await getMenuKeyboard(telegramId)
        });
        return;
    }
    
    // ── Cabinet Connection Flow ──
    if (session.state === 'awaiting_email') {
        if (text.length < 2) {
            await ctx.reply('⚠️ Email yoki Consulting nomini kiriting:');
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
                reply_markup: await getMenuKeyboard(telegramId)
            });
            return;
        }
        
        await clearSessionState(telegramId);
        await ctx.reply('✅ *Muvaffaqiyatli ulandi!*', {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(connectResult.user?.username)
        });
        
        // Immediately sync and show their cabinet
        await handleCabinetMenu(ctx);
        return;
    }
    
    // ── One-Off Manual check flow ──
    if (session.state === 'awaiting_check_passport') {
        if (!PASSPORT_REGEX.test(text)) {
            await ctx.reply('⚠️ Pasport raqami xato. Misol: AA1234567. Qaytadan kiriting:');
            return;
        }
        
        const visaType = session.data.visaType;
        const passport = text.toUpperCase();
        
        // Search if we have matching student details in our CRM database or manual check history
        try {
            let dbRes = await db.execute({
                sql: `
                    SELECT fullname, birthday, visa_type
                    FROM students
                    WHERE passport = ? AND deletedAt IS NULL
                    ORDER BY createdAt DESC
                    LIMIT 1
                `,
                args: [passport]
            });

            // If not found in CRM students, fallback to bot_manual_refreshes
            if (dbRes.rows.length === 0) {
                dbRes = await db.execute({
                    sql: `
                        SELECT fullname, birthday, visa_type
                        FROM bot_manual_refreshes
                        WHERE passport = ?
                        LIMIT 1
                    `,
                    args: [passport]
                });
            }
            
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
                await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday, telegramId);
            } catch (err: any) {
                await clearSessionState(telegramId);
                await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
                    reply_markup: await getMenuKeyboard(telegramId)
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
            await displayCheckResult(ctx, checkRes, passport, 'E-Visa', text, fullName, birthday, telegramId);
        } catch (err: any) {
            await clearSessionState(telegramId);
            await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
                reply_markup: await getMenuKeyboard(telegramId)
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
        const statusMsg = await ctx.reply(`🔄 *Tekshirilmoqda...*`, { parse_mode: 'Markdown' });
        
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
            const canDownloadPdf = isApproved && (res.student.visaType || '').toLowerCase() !== 'e-visa';
            
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${res.student.passport}` }],
                        [{ text: '📥 Viza (pdf)', callback_data: `download_pdf:${res.student.passport}` }]
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
                const noChangeMsg = await ctx.reply(`${res.student.fullName.toUpperCase()}\nO'zgarish yo'q 🤷🏻`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                await ctx.api.deleteMessage(ctx.chat!.id, noChangeMsg.message_id).catch(() => {});
            }
        }
        return;
    }
    
    // ── Account Connection button ──
    if (callbackData === 'account:connect') {
        await clearSessionState(telegramId);
        await setSessionState(telegramId, 'awaiting_email', {});
        await ctx.reply('🔒 *Kabinetga kirish*\n\nEmail yoki Consulting nomini kiriting:', {
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
                reply_markup: await getMenuKeyboard(telegramId)
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
                    await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday, telegramId);
                } catch (err: any) {
                    await clearSessionState(telegramId);
                    await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`, {
                        reply_markup: await getMenuKeyboard(telegramId)
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
            const canDownloadPdf = isApproved && (student.visaType || '').toLowerCase() !== 'e-visa';
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `refresh:${student.passport}` }],
                        [{ text: '📥 Viza (pdf)', callback_data: `download_pdf:${student.passport}` }]
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
        const statusMsg = await ctx.reply(`🔄 *Tekshirilmoqda...*`, { parse_mode: 'Markdown' });
        
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
                    reply_markup: await getMenuKeyboard(telegramId)
                });
                return;
            }
            
            const emoji = getStatusEmoji(checkRes.latestStatus);
            const desc = getStatusDescription(checkRes.latestStatus);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => checkRes.latestStatus.toLowerCase().includes(s));
            const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa';
            
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
                (checkRes.previousRejectionReason ? `\nBundan oldingi ariza natijasi:\n🚫 Sababi: ${checkRes.previousRejectionReason}\n` : '') +
                (checkRes.pdfUrl && canDownloadPdf ? `\n📄 [Visa sertifikatini yuklash](${checkRes.pdfUrl})\n` : '');
                
            const currentText = cardMessage?.text || '';
            const changed = !currentText.toLowerCase().includes(checkRes.latestStatus.toLowerCase());
            
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport}` }],
                        [{ text: '📥 Viza (pdf)', callback_data: `download_pdf:${passport}` }]
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
                const noChangeMsg = await ctx.reply(`${fullName.toUpperCase()}\nO'zgarish yo'q 🤷🏻`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                await ctx.api.deleteMessage(ctx.chat!.id, noChangeMsg.message_id).catch(() => {});
            }
        } catch (err: any) {
            // Delete the status message
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            await ctx.reply(`❌ *Tekshirish xatosi:* ${err.message}`);
        }
        return;
    }

    // ── Save to Cabinet Confirmation ──
    if (callbackData.startsWith('save_to_cabinet:')) {
        const parts = callbackData.split(':');
        const choice = parts[1]; // 'yes' or 'no'
        const passport = (parts[2] || '').toUpperCase().trim();

        // Remove the prompt message
        const promptMsg = ctx.callbackQuery?.message;
        if (promptMsg) {
            await ctx.api.deleteMessage(ctx.chat!.id, promptMsg.message_id).catch(() => {});
        }

        if (choice === 'no') {
            await ctx.reply('📝 Kabinetga saqlanmadi.');
            return;
        }

        // Retrieve the pending save data from session state
        const session = await getSessionState(telegramId);
        const saveData = session.data;

        if (!saveData || !saveData.pendingSave || saveData.pendingSave.passport !== passport) {
            await ctx.reply("⚠️ Ma'lumot topilmadi. Qaytadan tekshiring.");
            return;
        }

        const {
            fullName,
            birthday,
            visaType,
            applicationNo,
            status,
            applicationDate,
            rejectReason,
            pdfUrl
        } = saveData.pendingSave;

        try {
            const cabinetUser = await getUserByTelegramId(telegramId);
            if (!cabinetUser) {
                await ctx.reply('⚠️ Kabinet ulanmagan. Avval /cabinet orqali ulaning.');
                return;
            }
            const userId = cabinetUser.id;

            const existing = await db.execute({
                sql: 'SELECT passport, deletedAt FROM students WHERE passport = ? AND userId = ?',
                args: [passport, userId]
            });

            if (existing.rows.length > 0) {
                const row = existing.rows[0] as any;
                if (!row.deletedAt) {
                    await db.execute({
                        sql: `UPDATE students SET
                            fullName = ?, birthday = ?, visaType = ?, applicationNo = ?,
                            status = ?, applicationDate = ?, rejectReason = ?, pdfUrl = ?,
                            lastChecked = datetime('now')
                        WHERE passport = ? AND userId = ?`,
                        args: [
                            fullName.toUpperCase().trim(), birthday, visaType, applicationNo || '',
                            status || 'Pending', applicationDate || '', rejectReason || '', pdfUrl || '',
                            passport, userId
                        ]
                    });
                    await ctx.reply(`✅ *${passport}* kabinetda yangilandi.`, { parse_mode: 'Markdown' });
                } else {
                    await db.execute({
                        sql: `UPDATE students SET
                            deletedAt = NULL, fullName = ?, birthday = ?, visaType = ?,
                            applicationNo = ?, status = ?, applicationDate = ?, rejectReason = ?, pdfUrl = ?,
                            lastChecked = datetime('now')
                        WHERE passport = ? AND userId = ?`,
                        args: [
                            fullName.toUpperCase().trim(), birthday, visaType, applicationNo || '',
                            status || 'Pending', applicationDate || '', rejectReason || '', pdfUrl || '',
                            passport, userId
                        ]
                    });
                    await ctx.reply(`✅ *${passport}* kabinetga qayta qo'shildi.`, { parse_mode: 'Markdown' });
                }
            } else {
                await db.execute({
                    sql: `INSERT INTO students (
                        passport, fullName, birthday, studentId, status,
                        lastChecked, rejectReason, pdfUrl, apiResponse,
                        batchSelected, createdAt, userId, visaType, applicationNo, applicationDate
                    ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`,
                    args: [
                        passport, fullName.toUpperCase().trim(), birthday, '',
                        status || 'Pending', rejectReason || '', pdfUrl || '',
                        JSON.stringify({ status, detail: status }), 0,
                        userId, visaType, applicationNo || '', applicationDate || ''
                    ]
                });
                await ctx.reply(`✅ *${passport}* kabinetga saqlandi!`, { parse_mode: 'Markdown' });
            }

            await clearSessionState(telegramId);
        } catch (err: any) {
            console.error('[Save to Cabinet Error]:', err.message);
            await ctx.reply(`❌ Saqlashda xatolik: ${err.message}`);
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
    birthday: string,
    telegramId?: number
) {
    // ── Always save student data to bot_manual_refreshes ──────────────────
    // This runs BEFORE the found-check so the passport/name/birthday is
    // persisted even when the visa portal returns no result. This enables
    // autofill in the Add Student modal and visa-status.html.
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
        console.log(`[Bot DB] Saved to bot_manual_refreshes: ${passport.toUpperCase().trim()}`);
    } catch (err: any) {
        console.error('[Manual Check Database Save Error]:', err.message);
    }

    // If user is signed into a cabinet, prepare pending save state in session
    let isCabinetConnected = false;
    if (telegramId) {
        try {
            const cabinetUser = await getUserByTelegramId(telegramId);
            if (cabinetUser) {
                isCabinetConnected = true;
                // Store pending save data in session so the callback can retrieve it
                await setSessionState(telegramId, 'awaiting_cabinet_save', {
                    pendingSave: {
                        passport: passport.toUpperCase().trim(),
                        fullName: fullName.toUpperCase().trim(),
                        birthday,
                        visaType,
                        applicationNo,
                        status: result.found ? (result.latestStatus || 'Pending') : 'Pending',
                        applicationDate: result.found ? (result.latestDate || '') : '',
                        rejectReason: result.found ? (result.rejectionReason || '') : '',
                        pdfUrl: result.found ? (result.pdfUrl || '') : ''
                    }
                });
            }
        } catch (err: any) {
            console.error('[Cabinet Save Check Error]:', err.message);
        }
    }

    if (!result.found || (result.latestStatus || '').toUpperCase() === 'UNKNOWN') {
        const replyMarkup = telegramId ? await getMenuKeyboard(telegramId) : mainMenuKeyboard;
        await ctx.reply(
            `🚫 Natija yo'q\n\nPasport, Ism va Tug'ilgan kunni tekshiring`,
            {
                reply_markup: replyMarkup
            }
        );

        // Offer to save to cabinet even if no result found
        if (isCabinetConnected) {
            const passportKey = passport.toUpperCase().trim();
            await ctx.reply(
                `💾 Bu talabani kabinetga saqlansinmi?`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Ha', callback_data: `save_to_cabinet:yes:${passportKey}` },
                                { text: '❌ Yo\'q', callback_data: `save_to_cabinet:no:${passportKey}` }
                            ]
                        ]
                    }
                }
            );
        }
        return;
    }
    
    const emoji = getStatusEmoji(result.latestStatus);
    const desc = getStatusDescription(result.latestStatus);
    const isApproved = ['approved', 'visa used', 'issued'].some(s => result.latestStatus.toLowerCase().includes(s));
    const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa';
    
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
        (result.previousRejectionReason ? `\nBundan oldingi ariza natijasi:\n🚫 Sababi: ${result.previousRejectionReason}\n` : '') +
        (result.pdfUrl && canDownloadPdf ? `\n📄 [Visa sertifikatini yuklash](${result.pdfUrl})\n` : '');
        
    const inlineKeyboard = {
        inline_keyboard: canDownloadPdf
            ? [
                [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }],
                [{ text: '📥 Viza (pdf)', callback_data: `download_pdf:${passport.toUpperCase().trim()}` }]
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

    // Show cabinet save prompt if user is connected
    if (isCabinetConnected) {
        const passportKey = passport.toUpperCase().trim();
        await ctx.reply(
            `💾 Bu talabani kabinetga saqlansinmi?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Ha', callback_data: `save_to_cabinet:yes:${passportKey}` },
                            { text: '❌ Yo\'q', callback_data: `save_to_cabinet:no:${passportKey}` }
                        ]
                    ]
                }
            }
        );
    }
}
