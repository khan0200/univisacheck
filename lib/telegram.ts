/**
 * lib/telegram.ts
 * 
 * Initializes the grammY Bot instance and registers all routers, handlers, and commands.
 */

import { Bot } from 'grammy';
import { 
    handleStart, 
    handleCabinetCommand, 
    handleCheckCommand, 
    handleHelpCommand, 
    handleCabinetMenu, 
    handleAccountMenu 
} from '../bot/commands';
import { handleTextMessage, handleCallbackQuery } from '../bot/handlers';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Don't throw during compile time or local non-bot tests if token is missing
const botToken = token || 'dummy-token-for-compilation';

export const bot = new Bot(botToken);

// ── Register Bot Slash Commands ──
bot.command('start', handleStart);
bot.command('cabinet', handleCabinetCommand);
bot.command('check', handleCheckCommand);
bot.command('help', handleHelpCommand);

// ── Register Reply Keyboard Listeners (hears) ──
bot.hears('📂 Kabinet', handleCabinetMenu);
bot.hears('🔍 Tekshirish', handleCheckCommand);
bot.hears(/^⚙/, handleAccountMenu);

// ── Register Message & Callback Processors ──
bot.on('message:text', handleTextMessage);
bot.on('callback_query:data', handleCallbackQuery);

// ── Global Error Catching Middleware ──
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Bot Error] Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof Error) {
        console.error('Error stack:', e.stack);
    } else {
        console.error('Error detail:', e);
    }
});
export default bot;
