/**
 * bot/keyboards.ts
 * 
 * Defines all standard reply and inline keyboards used by the Telegram bot.
 */

import { Keyboard, InlineKeyboard } from 'grammy';

/**
 * Persistent Main Menu Reply Keyboard.
 * Uses resized, persistent layouts.
 */
/**
 * Persistent Main Menu Reply Keyboard — Not connected state.
 */
export const mainMenuKeyboard = new Keyboard()
    .text('📂 Kabinet').text('🔍 Tekshirish').row()
    .text('⚙ Consultingni ulash')
    .resized()
    .selected(true);

/**
 * Builds a personalised main menu keyboard.
 * @param username - Cabinet username; if provided, shows "⚙ {username}" instead of default label.
 */
export function getMainMenuKeyboard(username?: string | null): Keyboard {
    const profileLabel = username ? `⚙ ${username}` : '⚙ Consultingni ulash';
    return new Keyboard()
        .text('📂 Kabinet').text('🔍 Tekshirish').row()
        .text(profileLabel)
        .resized()
        .selected(true);
}

/**
 * Creates an inline keyboard with a refresh button for a specific student.
 * Callback format: `refresh:<passport_number>`
 */
export function getStudentCardKeyboard(passport: string): InlineKeyboard {
    return new InlineKeyboard()
        .text('🔄 Yangilash', `refresh:${passport.toUpperCase().trim()}`);
}

/**
 * Inline keyboard to choose Visa Type during /check conversation.
 */
export const visaTypeKeyboard = new InlineKeyboard()
    .text('Elchixona', 'check_type:Embassy').row()
    .text('Elektron (E-Visa)', 'check_type:E-Visa');

/**
 * Inline keyboard to choose Cabinet Category.
 */
export const cabinetMenuKeyboard = new InlineKeyboard()
    .text('⏳ Kutilmoqda', 'cabinet_tab:pending')
    .text('📄 Arizalar', 'cabinet_tab:application').row()
    .text('❌ Rad etildi', 'cabinet_tab:cancelled')
    .text('🟢 Tasdiqlandi', 'cabinet_tab:approved');

/**
 * Inline keyboard for Account menu actions.
 */
export const accountMenuKeyboard = new InlineKeyboard()
    .text('🔴 Chiqish', 'account:disconnect');

/**
 * Simple cancellation button for input dialogues.
 */
export const cancelKeyboard = new Keyboard()
    .text('⬅️ Orqaga')
    .resized()
    .oneTime();
