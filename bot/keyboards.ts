/**
 * bot/keyboards.ts
 * 
 * Defines all standard reply and inline keyboards used by the Telegram bot.
 * All keyboards accept an optional `lang` parameter for UZ/EN localisation.
 */

import { Keyboard, InlineKeyboard } from 'grammy';
import { t, Lang } from '../lib/i18n';

/**
 * Builds the personalised main menu keyboard.
 * Layout:
 *   [ 📂 Kabinet ]  [ 🔍 Tekshirish ]
 *   [ ⚙️ Sozlamalar ]
 *   [ ⚙ {username} / ⚙ Consultingni ulash ]
 */
export function getMainMenuKeyboard(username?: string | null, lang: Lang = 'uz'): Keyboard {
    const profileLabel = username ? `⚙ ${username}` : (lang === 'en' ? '⚙ Connect Consulting' : '⚙ Consultingni ulash');
    return new Keyboard()
        .text(t('menu_cabinet', lang)).text(t('menu_check', lang)).row()
        .text(t('menu_settings', lang)).row()
        .text(profileLabel)
        .resized()
        .selected(true);
}

/** Fallback static main menu (not connected, default UZ). */
export const mainMenuKeyboard = getMainMenuKeyboard(null, 'uz');

/**
 * Creates an inline keyboard with a refresh (and optionally PDF) button.
 */
export function getStudentCardKeyboard(passport: string, canDownloadPdf = false, lang: Lang = 'uz'): InlineKeyboard {
    const kb = new InlineKeyboard()
        .text(t('btn_refresh', lang), `refresh:${passport.toUpperCase().trim()}`);
    if (canDownloadPdf) {
        kb.row().text(t('btn_pdf', lang), `download_pdf:${passport.toUpperCase().trim()}`);
    }
    return kb;
}

/**
 * Inline keyboard to choose Visa Type during /check conversation.
 */
export function getVisaTypeKeyboard(lang: Lang = 'uz'): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('visa_type_embassy', lang), 'check_type:Embassy').row()
        .text(t('visa_type_evisa', lang), 'check_type:E-Visa');
}

/** Static fallback (UZ). */
export const visaTypeKeyboard = getVisaTypeKeyboard('uz');

/**
 * Inline keyboard to choose Cabinet Category.
 */
export function getCabinetMenuKeyboard(lang: Lang = 'uz'): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('tab_pending', lang), 'cabinet_tab:pending')
        .text(t('tab_application', lang), 'cabinet_tab:application').row()
        .text(t('tab_cancelled', lang), 'cabinet_tab:cancelled')
        .text(t('tab_approved', lang), 'cabinet_tab:approved');
}

/** Static fallback (UZ). */
export const cabinetMenuKeyboard = getCabinetMenuKeyboard('uz');

/**
 * Inline keyboard for the Settings menu — language selection.
 */
export function getSettingsKeyboard(lang: Lang = 'uz'): InlineKeyboard {
    return new InlineKeyboard()
        .text((lang === 'uz' ? '✅ ' : '') + t('settings_lang_uz', lang), 'settings:lang:uz').row()
        .text((lang === 'en' ? '✅ ' : '') + t('settings_lang_en', lang), 'settings:lang:en');
}

/**
 * Inline keyboard for Account menu actions.
 */
export function getAccountMenuKeyboard(lang: Lang = 'uz'): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('cabinet_disconnect_btn', lang), 'account:disconnect');
}

/** Static fallback. */
export const accountMenuKeyboard = getAccountMenuKeyboard('uz');

/**
 * Simple cancellation button for input dialogues.
 */
export function getCancelKeyboard(lang: Lang = 'uz'): Keyboard {
    return new Keyboard()
        .text(t('back_button', lang))
        .resized()
        .oneTime();
}

/** Static fallback (UZ). */
export const cancelKeyboard = getCancelKeyboard('uz');


