/**
 * api/telegram.ts
 * 
 * Vercel Serverless Function acting as the Telegram bot webhook endpoint.
 * Binds grammY webhookCallback with Next.js adapter.
 */

import { webhookCallback } from 'grammy';
import bot from '../lib/telegram';
import { initDb } from '../lib/turso';

// Track database connection initialization across serverless warm starts
let dbInitialized = false;

async function ensureDbInitialized() {
    if (!dbInitialized) {
        await initDb();
        dbInitialized = true;
    }
}

// Next.js style handler compatible with Vercel Serverless Functions
const handler = webhookCallback(bot, 'next-js');

export default async (req: any, res: any) => {
    // Enable CORS just in case
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
    }

    try {
        // Ensure database columns/tables exist before handling the webhook
        await ensureDbInitialized();
        
        // Pass request to grammY update router
        return await handler(req, res);
    } catch (err: any) {
        console.error('[Webhook API Error]:', err.message);
        // Respond to Telegram with a success code to prevent Telegram from spam retrying
        res.status(200).json({ ok: false, error: err.message });
    }
};
