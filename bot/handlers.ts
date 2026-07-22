/**
 * bot/handlers.ts
 * 
 * Implements callback query processing and conversational state-machine handlers.
 */

import { Context, InputFile } from 'grammy';
import { connectUser, disconnectUser, getUserByTelegramId } from '../lib/auth';
import { checkStudentVisaStatus, downloadStudentVisaPdf } from '../lib/visa';
import { getSessionState, setSessionState, clearSessionState, handleCabinetMenu } from './commands';
import { getMainMenuKeyboard, mainMenuKeyboard, getCancelKeyboard, getVisaTypeKeyboard, getSettingsKeyboard } from './keyboards';
import { getStatusEmoji, getStatusDescription, refreshStudent, formatStudentCard, getStudentsByTelegramId, formatLastChecked, isSameStatus } from '../lib/cabinet';
import { getLang, setLang, t, Lang } from '../lib/i18n';
import db from '../lib/turso';

// Input Validation Helpers
const PASSPORT_REGEX = /^[A-Z]{2}\d{7}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function getMenuKeyboard(telegramId: number) {
    const user = await getUserByTelegramId(telegramId);
    const lang = await getLang(telegramId);
    return getMainMenuKeyboard(user?.username, lang);
}


/**
 * Main Text Message handler (State Machine).
 * Processes inputs for various conversation flows.
 */
export async function handleTextMessage(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const text = ctx.message?.text?.trim() || '';
    const lang = await getLang(telegramId);
    
    // Check if user wants to cancel/back out
    if (text === '⬅️ Orqaga' || text === '⬅️ Back' || text === '⬅ Orqaga' || text.toLowerCase().includes('orqaga') || text === '<') {
        await clearSessionState(telegramId);
        await ctx.reply(t('main_menu', lang), {
            reply_markup: await getMenuKeyboard(telegramId)
        });
        return;
    }
    
    // Get session
    const session = await getSessionState(telegramId);
    
    if (session.state === 'idle') {
        await ctx.reply(t('menu_fallback', lang), {
            reply_markup: await getMenuKeyboard(telegramId)
        });
        return;
    }
    
    // ── Cabinet Connection Flow ──
    if (session.state === 'awaiting_email') {
        if (text.length < 2) {
            await ctx.reply(t('login_email_short', lang));
            return;
        }
        
        await setSessionState(telegramId, 'awaiting_password', { email: text });
        await ctx.reply(t('login_password_prompt', lang), {
            parse_mode: 'Markdown',
            reply_markup: getCancelKeyboard(lang)
        });
        return;
    }
    
    if (session.state === 'awaiting_password') {
        const email = session.data.email;
        await ctx.reply(t('login_checking', lang), { parse_mode: 'Markdown' });
        
        const connectResult = await connectUser(
            telegramId,
            ctx.from?.username || '',
            ctx.from?.first_name || '',
            ctx.from?.last_name || '',
            email,
            text,
            lang
        );
        
        if (!connectResult.success) {
            await clearSessionState(telegramId);
            await ctx.reply(`${t('login_error_prefix', lang)}${connectResult.error}`, {
                parse_mode: 'Markdown',
                reply_markup: await getMenuKeyboard(telegramId)
            });
            return;
        }
        
        await clearSessionState(telegramId);
        await ctx.reply(t('login_success', lang), {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(connectResult.user?.username, lang)
        });
        
        await handleCabinetMenu(ctx);
        return;
    }
    
    // ── One-Off Manual check flow ──
    if (session.state === 'awaiting_check_passport') {
        if (!PASSPORT_REGEX.test(text)) {
            await ctx.reply(t('check_passport_invalid', lang));
            return;
        }
        
        const visaType = session.data.visaType;
        const passport = text.toUpperCase();
        
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
                    
                    await ctx.reply(
                        t('autofill_found', lang, { passport }),
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: `${dbName}`, callback_data: 'autofill:yes' }],
                                    [{ text: t('autofill_manual_btn', lang), callback_data: 'autofill:no' }]
                                ]
                            }
                        }
                    );
                    return;
                }
            }
        } catch (dbErr: any) {
            console.error('[Autofill DB Search Error]:', dbErr.message);
        }
        
        await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
        await ctx.reply(t('check_name_prompt', lang), {
            parse_mode: 'Markdown',
            reply_markup: getCancelKeyboard(lang)
        });
        return;
    }
    
    if (session.state === 'awaiting_check_name') {
        if (text.length < 2) {
            await ctx.reply(t('check_name_short', lang));
            return;
        }
        
        const { visaType, passport } = session.data;
        await setSessionState(telegramId, 'awaiting_check_dob', { visaType, passport, fullName: text.toUpperCase() });
        await ctx.reply(t('check_dob_prompt', lang), {
            parse_mode: 'Markdown',
            reply_markup: getCancelKeyboard(lang)
        });
        return;
    }
    
    if (session.state === 'awaiting_check_dob') {
        if (!DATE_REGEX.test(text)) {
            await ctx.reply(t('check_dob_invalid', lang));
            return;
        }
        
        const { visaType, passport, fullName } = session.data;
        const birthday = text;
        
        if (visaType === 'Embassy') {
            await ctx.reply(t('check_waiting', lang), { parse_mode: 'Markdown' });
            try {
                const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'Embassy', '');
                await clearSessionState(telegramId);
                await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday, telegramId);
            } catch (err: any) {
                await clearSessionState(telegramId);
                await ctx.reply(t('check_error', lang, { error: err.message }), {
                    reply_markup: await getMenuKeyboard(telegramId)
                });
            }
        } else {
            await setSessionState(telegramId, 'awaiting_check_appno', { visaType, passport, fullName, birthday });
            await ctx.reply(t('check_appno_prompt', lang), {
                parse_mode: 'Markdown',
                reply_markup: getCancelKeyboard(lang)
            });
        }
        return;
    }
    
    if (session.state === 'awaiting_check_appno') {
        if (text.length < 5) {
            await ctx.reply(t('check_appno_invalid', lang));
            return;
        }
        
        const { passport, fullName, birthday } = session.data;
        await ctx.reply(t('check_waiting', lang), { parse_mode: 'Markdown' });
        
        try {
            const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'E-Visa', text);
            await clearSessionState(telegramId);
            await displayCheckResult(ctx, checkRes, passport, 'E-Visa', text, fullName, birthday, telegramId);
        } catch (err: any) {
            await clearSessionState(telegramId);
            await ctx.reply(t('check_error', lang, { error: err.message }), {
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
    
    const lang = await getLang(telegramId);

    // ── Language Settings ──
    if (callbackData.startsWith('settings:lang:')) {
        const newLang = callbackData.split(':')[2] as Lang;
        if (newLang !== 'uz' && newLang !== 'en') return;
        await setLang(telegramId, newLang);
        const confirmKey = newLang === 'en' ? 'settings_lang_changed_en' : 'settings_lang_changed_uz';
        await ctx.reply(t(confirmKey, newLang), {
            reply_markup: await getMenuKeyboard(telegramId)
        });
        // Update the settings message to reflect new selection
        const settingsMsg = ctx.callbackQuery?.message;
        if (settingsMsg) {
            await ctx.api.editMessageReplyMarkup(
                ctx.chat!.id,
                settingsMsg.message_id,
                { reply_markup: getSettingsKeyboard(newLang) }
            ).catch(() => {});
        }
        return;
    }

    // ── Individual Refresh Button Click ──
    if (callbackData.startsWith('refresh:')) {
        const passport = callbackData.split(':')[1];
        const cardMessage = ctx.callbackQuery?.message;

        if (cardMessage) {
            await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
        }
        
        const statusMsg = await ctx.reply(t('refreshing', lang), { parse_mode: 'Markdown' });
        
        const res = await refreshStudent(telegramId, passport);
        
        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        
        if (!res.success) {
            await ctx.reply(t('refresh_error', lang, { error: res.error || '' }));
            return;
        }
        
        if (res.student) {
            const cardText = formatStudentCard(res.student, res.changed, res.oldStatus, lang);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => (res.student?.status || '').toLowerCase().includes(s));
            const canDownloadPdf = isApproved && (res.student.visaType || '').toLowerCase() !== 'e-visa';
            
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: t('btn_refresh', lang), callback_data: `refresh:${res.student.passport}` }],
                        [{ text: t('btn_pdf', lang), callback_data: `download_pdf:${res.student.passport}` }]
                      ]
                    : [
                        [{ text: t('btn_refresh', lang), callback_data: `refresh:${res.student.passport}` }]
                      ]
            };
            
            await ctx.reply(cardText, { reply_markup: inlineKeyboard });
            
            if (!res.changed) {
                const noChangeMsg = await ctx.reply(t('no_change', lang, { name: res.student.fullName.toUpperCase() }));
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
        await ctx.reply(t('login_title', lang), { parse_mode: 'Markdown' });
        return;
    }
    
    // ── Account Disconnect Button Click ──
    if (callbackData === 'account:disconnect') {
        const success = await disconnectUser(telegramId);
        if (success) {
            await ctx.reply(t('cabinet_disconnected', lang), {
                parse_mode: 'Markdown',
                reply_markup: await getMenuKeyboard(telegramId)
            });
        } else {
            await ctx.reply(t('profile_not_connected', lang));
        }
        return;
    }
    
    // ── Manual Visa Check Application Mode choice ──
    if (callbackData.startsWith('check_type:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_type') return;
        
        const visaType = callbackData.split(':')[1];
        
        await setSessionState(telegramId, 'awaiting_check_passport', { visaType });
        await ctx.reply(t('check_passport_prompt', lang), {
            parse_mode: 'Markdown',
            reply_markup: getCancelKeyboard(lang)
        });
        return;
    }
    
    // ── Autofill Choice selection ──
    if (callbackData.startsWith('autofill:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_autofill_choice') return;
        
        const choice = callbackData.split(':')[1];
        
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
            
            await ctx.reply(
                t('autofill_confirm', lang, { name: autofill.fullName, dob: autofill.birthday, visaType }),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: t('btn_yes', lang), callback_data: 'autofill_confirm:yes' },
                            { text: t('btn_no', lang), callback_data: 'autofill_confirm:no' }
                        ]]
                    }
                }
            );
        } else {
            const { passport, visaType } = session.data;
            await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
            await ctx.reply(t('check_name_prompt', lang), {
                parse_mode: 'Markdown',
                reply_markup: getCancelKeyboard(lang)
            });
        }
        return;
    }
    
    // ── Autofill Confirm selection ──
    if (callbackData.startsWith('autofill_confirm:')) {
        const session = await getSessionState(telegramId);
        if (session.state !== 'awaiting_check_autofill_confirm') return;
        
        const confirm = callbackData.split(':')[1];
        
        const cardMessage = ctx.callbackQuery?.message;
        if (cardMessage) {
            await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
        }
        
        const { passport, visaType, fullName, birthday } = session.data;
        
        if (confirm === 'yes') {
            if (visaType === 'Embassy') {
                await ctx.reply(t('check_waiting', lang), { parse_mode: 'Markdown' });
                try {
                    const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, 'Embassy', '');
                    await clearSessionState(telegramId);
                    await displayCheckResult(ctx, checkRes, passport, 'Embassy', '', fullName, birthday, telegramId);
                } catch (err: any) {
                    await clearSessionState(telegramId);
                    await ctx.reply(t('check_error', lang, { error: err.message }), {
                        reply_markup: await getMenuKeyboard(telegramId)
                    });
                }
            } else {
                await setSessionState(telegramId, 'awaiting_check_appno', { visaType, passport, fullName, birthday });
                await ctx.reply(t('check_appno_prompt', lang), {
                    parse_mode: 'Markdown',
                    reply_markup: getCancelKeyboard(lang)
                });
            }
        } else {
            await setSessionState(telegramId, 'awaiting_check_name', { visaType, passport });
            await ctx.reply(t('check_name_prompt', lang), {
                parse_mode: 'Markdown',
                reply_markup: getCancelKeyboard(lang)
            });
        }
        return;
    }
    
    // ── Cabinet Category Selection ──
    if (callbackData.startsWith('cabinet_tab:')) {
        const tab = callbackData.split(':')[1];
        
        const students = await getStudentsByTelegramId(telegramId);
        
        const filtered = students.filter(student => {
            const status = (student.status || '').toLowerCase();
            const isApproved = status.includes('approved') || status.includes('visa used');
            const isCancelled = status.includes('cancel') || status.includes('reject');
            const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error');
            
            if (tab === 'pending') return isPending;
            if (tab === 'approved') return isApproved;
            if (tab === 'cancelled') return isCancelled;
            if (tab === 'application') return !isPending && !isCancelled && !isApproved;
            return false;
        });
        
        const catKeyMap: Record<string, string> = {
            pending: 'cat_pending', approved: 'cat_approved',
            cancelled: 'cat_cancelled', application: 'cat_application'
        };
        const catLabel = t(catKeyMap[tab] || 'cat_pending', lang);
        
        if (filtered.length === 0) {
            await ctx.reply(t('cabinet_empty', lang), { parse_mode: 'Markdown' });
            return;
        }
        
        await ctx.reply(t('cabinet_header', lang, { cat: catLabel, n: filtered.length }), {
            parse_mode: 'Markdown'
        });
        
        for (const student of filtered) {
            const cardText = formatStudentCard(student, false, '', lang);
            const isApproved = ['approved', 'visa used', 'issued'].some(s => (student.status || '').toLowerCase().includes(s));
            const canDownloadPdf = isApproved && (student.visaType || '').toLowerCase() !== 'e-visa';
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: t('btn_refresh', lang), callback_data: `refresh:${student.passport}` }],
                        [{ text: t('btn_pdf', lang), callback_data: `download_pdf:${student.passport}` }]
                      ]
                    : [
                        [{ text: t('btn_refresh', lang), callback_data: `refresh:${student.passport}` }]
                      ]
            };
            await ctx.reply(cardText, { reply_markup: inlineKeyboard });
        }
        return;
    }

    // ── Download Certificate PDF Button Click ──
    if (callbackData.startsWith('download_pdf:')) {
        const passport = callbackData.split(':')[1].toUpperCase().trim();
        const progressMsg = await ctx.reply(t('pdf_loading', lang), { parse_mode: 'Markdown' });
        
        try {
            let fullName = '';
            let birthday = '';
            let visaType = 'Embassy';
            let applicationNo = '';
            let pdfUrl = '';
            
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
                }
            }
            
            if (!fullName || !birthday) {
                await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
                await ctx.reply(t('pdf_no_student', lang));
                return;
            }
            
            const pdfRes = await downloadStudentVisaPdf(passport, fullName, birthday, visaType, applicationNo, pdfUrl);
            
            await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
            
            await ctx.replyWithDocument(new InputFile(pdfRes.buffer, pdfRes.filename), {
                caption: t('pdf_caption', lang, { passport }),
                parse_mode: 'Markdown'
            });
        } catch (err: any) {
            await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
            await ctx.reply(t('pdf_error', lang, { error: err.message }));
        }
        return;
    }

    // ── Manual Check Refresh Button Click ──
    if (callbackData.startsWith('mrefresh:')) {
        const passport = callbackData.split(':')[1].toUpperCase().trim();
        const cardMessage = ctx.callbackQuery?.message;

        if (cardMessage) {
            await ctx.api.deleteMessage(ctx.chat!.id, cardMessage.message_id).catch(() => {});
        }
        
        const statusMsg = await ctx.reply(t('refreshing', lang), { parse_mode: 'Markdown' });
        
        try {
            const res = await db.execute({
                sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ?',
                args: [passport]
            });
            
            if (res.rows.length === 0) {
                await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
                await ctx.reply(t('passport_not_found', lang));
                return;
            }
            
            const row = res.rows[0] as any;
            const fullName = row.fullname;
            const birthday = row.birthday;
            const visaType = row.visa_type;
            const applicationNo = row.application_no || '';
            
            const checkRes = await checkStudentVisaStatus(passport, fullName, birthday, visaType, applicationNo);
            
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            
            if (!checkRes.found || (checkRes.latestStatus || '').toUpperCase() === 'UNKNOWN') {
                await ctx.reply(t('no_result', lang), {
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
                `${t('notif_title', lang)}\n\n` +
                `👤 ${fullName.toUpperCase()}\n` +
                `🛂 ${passport.toUpperCase()}\n` +
                `🎂 ${birthday}\n\n` +
                `${t('notif_visa_type', lang)} ${checkRes.statusOfResidence || checkRes.visaKind || visaType}\n` +
                (visaType === 'E-Visa' ? `${t('notif_partner', lang)} ${checkRes.invitingCompany || t('notif_na', lang)}\n` : '') +
                (visaType === 'E-Visa' ? `${t('notif_app_no', lang)} ${applicationNo}\n` : '') +
                `${t('notif_submitted', lang)} ${checkRes.latestDate || t('notif_na', lang)}\n` +
                `${t('notif_status', lang)} ${emoji} ${checkRes.latestStatus.toUpperCase()}\n` +
                ((checkRes.entryDate || isApproved) ? `${lang === 'en' ? '🗓️ Visa given date:' : '🗓️ Visa berilgan sana:'} ${checkRes.entryDate || checkRes.latestDate || 'N/A'}\n` : '') +
                `\n${t('notif_checked', lang)} ${checkedStr}\n\n` +
                `${t('notif_result', lang)} ${desc}\n` +
                (checkRes.rejectionReason ? `\n${t('notif_reason', lang)} ${checkRes.rejectionReason}\n` : '') +
                (checkRes.previousRejectionReason ? `\n${t('notif_prev_reason', lang)} ${checkRes.previousRejectionReason}\n` : '') +
                (checkRes.pdfUrl && canDownloadPdf ? `\n📄 [${t('notif_pdf_link', lang)}](${checkRes.pdfUrl})\n` : '');
                
            const oldStatus = row.status || 'Pending';
            const changed = !isSameStatus(oldStatus, checkRes.latestStatus);
            
            const inlineKeyboard = {
                inline_keyboard: canDownloadPdf
                    ? [
                        [{ text: t('btn_refresh', lang), callback_data: `mrefresh:${passport}` }],
                        [{ text: t('btn_pdf', lang), callback_data: `download_pdf:${passport}` }]
                      ]
                    : [
                        [{ text: t('btn_refresh', lang), callback_data: `mrefresh:${passport}` }]
                      ]
            };
            
            await ctx.reply(resultText, {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard,
                link_preview_options: { is_disabled: true }
            });

            if (!changed) {
                const noChangeMsg = await ctx.reply(t('no_change', lang, { name: fullName.toUpperCase() }));
                await new Promise(resolve => setTimeout(resolve, 5000));
                await ctx.api.deleteMessage(ctx.chat!.id, noChangeMsg.message_id).catch(() => {});
            }
        } catch (err: any) {
            await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            await ctx.reply(t('check_error', lang, { error: err.message }));
        }
        return;
    }

    // ── Save to Cabinet Confirmation ──
    if (callbackData.startsWith('save_to_cabinet:')) {
        const parts = callbackData.split(':');
        const choice = parts[1];
        const passport = (parts[2] || '').toUpperCase().trim();

        const promptMsg = ctx.callbackQuery?.message;
        if (promptMsg) {
            await ctx.api.deleteMessage(ctx.chat!.id, promptMsg.message_id).catch(() => {});
        }

        if (choice === 'no') {
            await ctx.reply(t('save_no', lang));
            return;
        }

        const session = await getSessionState(telegramId);
        const saveData = session.data;

        if (!saveData || !saveData.pendingSave || saveData.pendingSave.passport !== passport) {
            await ctx.reply(t('save_data_missing', lang));
            return;
        }

        const {
            fullName, birthday, visaType, applicationNo,
            status, applicationDate, rejectReason, pdfUrl
        } = saveData.pendingSave;

        try {
            const cabinetUser = await getUserByTelegramId(telegramId);
            if (!cabinetUser) {
                await ctx.reply(t('connect_first_slash', lang));
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
                    await ctx.reply(t('save_updated', lang, { passport }), { parse_mode: 'Markdown' });
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
                    await ctx.reply(t('save_restored', lang, { passport }), { parse_mode: 'Markdown' });
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
                await ctx.reply(t('save_saved', lang, { passport }), { parse_mode: 'Markdown' });
            }

            await clearSessionState(telegramId);
        } catch (err: any) {
            console.error('[Save to Cabinet Error]:', err.message);
            await ctx.reply(t('save_error', lang, { error: err.message }));
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
    const lang: Lang = telegramId ? await getLang(telegramId) : 'uz';

    // ── Always save student data to bot_manual_refreshes ──────────────────
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

    let isCabinetConnected = false;
    if (telegramId) {
        try {
            const cabinetUser = await getUserByTelegramId(telegramId);
            if (cabinetUser) {
                isCabinetConnected = true;
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
        const replyMarkup = telegramId ? await (async () => {
            const user = await getUserByTelegramId(telegramId);
            return getMainMenuKeyboard(user?.username, lang);
        })() : mainMenuKeyboard;
        
        await ctx.reply(t('no_result', lang), { reply_markup: replyMarkup });

        if (isCabinetConnected) {
            const passportKey = passport.toUpperCase().trim();
            await ctx.reply(t('save_prompt', lang), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: t('btn_yes', lang), callback_data: `save_to_cabinet:yes:${passportKey}` },
                        { text: t('btn_no', lang), callback_data: `save_to_cabinet:no:${passportKey}` }
                    ]]
                }
            });
        }
        return;
    }
    
    const emoji = getStatusEmoji(result.latestStatus);
    const desc = getStatusDescription(result.latestStatus);
    const isApproved = ['approved', 'visa used', 'issued'].some(s => result.latestStatus.toLowerCase().includes(s));
    const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa';
    
    const checkedStr = formatLastChecked(new Date().toISOString());
    const resultText = 
        `${t('notif_title', lang)}\n\n` +
        `👤 ${fullName.toUpperCase()}\n` +
        `🛂 ${passport.toUpperCase()}\n` +
        `🎂 ${birthday}\n\n` +
        `${t('notif_visa_type', lang)} ${result.statusOfResidence || result.visaKind || visaType}\n` +
        (visaType === 'E-Visa' ? `${t('notif_partner', lang)} ${result.invitingCompany || t('notif_na', lang)}\n` : '') +
        (visaType === 'E-Visa' ? `${t('notif_app_no', lang)} ${applicationNo}\n` : '') +
        `${t('notif_submitted', lang)} ${result.latestDate || t('notif_na', lang)}\n` +
        `${t('notif_status', lang)} ${emoji} ${result.latestStatus.toUpperCase()}\n` +
        ((result.entryDate || isApproved) ? `${lang === 'en' ? '🗓️ Visa given date:' : '🗓️ Visa berilgan sana:'} ${result.entryDate || result.latestDate || 'N/A'}\n` : '') +
        `\n${t('notif_checked', lang)} ${checkedStr}\n\n` +
        `${t('notif_result', lang)} ${desc}\n` +
        (result.rejectionReason ? `\n${t('notif_reason', lang)} ${result.rejectionReason}\n` : '') +
        (result.previousRejectionReason ? `\n${t('notif_prev_reason', lang)} ${result.previousRejectionReason}\n` : '') +
        (result.pdfUrl && canDownloadPdf ? `\n📄 [${t('notif_pdf_link', lang)}](${result.pdfUrl})\n` : '');
        
    const inlineKeyboard = {
        inline_keyboard: canDownloadPdf
            ? [
                [{ text: t('btn_refresh', lang), callback_data: `mrefresh:${passport.toUpperCase().trim()}` }],
                [{ text: t('btn_pdf', lang), callback_data: `download_pdf:${passport.toUpperCase().trim()}` }]
              ]
            : [
                [{ text: t('btn_refresh', lang), callback_data: `mrefresh:${passport.toUpperCase().trim()}` }]
              ]
    };

    await ctx.reply(resultText, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard,
        link_preview_options: { is_disabled: true }
    });

    if (isCabinetConnected) {
        const passportKey = passport.toUpperCase().trim();
        await ctx.reply(t('save_prompt', lang), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t('btn_yes', lang), callback_data: `save_to_cabinet:yes:${passportKey}` },
                    { text: t('btn_no', lang), callback_data: `save_to_cabinet:no:${passportKey}` }
                ]]
            }
        });
    }
}
