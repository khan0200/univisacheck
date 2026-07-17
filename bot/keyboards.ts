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
export const mainMenuKeyboard = new Keyboard()
    .text('📂 Cabinet').text('🔍 Check Visa').row()
    .text('🔄 Refresh All').text('⚙ Account')
    .resized()
    .selected(true); // Keep keyboard persistent and open by default

/**
 * Creates an inline keyboard with a refresh button for a specific student.
 * Callback format: `refresh:<passport_number>`
 */
export function getStudentCardKeyboard(passport: string): InlineKeyboard {
    return new InlineKeyboard()
        .text('🔄 Refresh', `refresh:${passport.toUpperCase().trim()}`);
}

/**
 * Inline keyboard to choose Visa Type during /check conversation.
 */
export const visaTypeKeyboard = new InlineKeyboard()
    .text('Embassy (Diplomatic Mission)', 'check_type:Embassy').row()
    .text('E-Visa (Individual)', 'check_type:E-Visa');

/**
 * Inline keyboard to choose Cabinet Category.
 */
export const cabinetMenuKeyboard = new InlineKeyboard()
    .text('⏳ Pending', 'cabinet_tab:pending')
    .text('📄 Application', 'cabinet_tab:application').row()
    .text('❌ Cancelled', 'cabinet_tab:cancelled')
    .text('🟢 Approved', 'cabinet_tab:approved');

/**
 * Inline keyboard for Account menu actions.
 */
export const accountMenuKeyboard = new InlineKeyboard()
    .text('🔴 Disconnect Account', 'account:disconnect');

/**
 * Simple cancellation button for input dialogues.
 */
export const cancelKeyboard = new Keyboard()
    .text('❌ Cancel')
    .resized()
    .oneTime();
