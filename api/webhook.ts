/**
 * api/webhook.ts
 * 
 * Vercel Serverless Function helper to easily set or delete the Telegram bot webhook.
 * Automatically resolves the host domain dynamically.
 * 
 * Usage:
 *   GET /api/webhook             → Registers webhook for this domain
 *   GET /api/webhook?action=delete  → Deletes the current webhook
 */

import axios from 'axios';

export default async (req: any, res: any) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        return res.status(500).json({ 
            error: 'Missing TELEGRAM_BOT_TOKEN environment variable.' 
        });
    }
    
    // Resolve domain dynamically based on request headers
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram`;
    
    const action = req.query.action || 'set';
    
    try {
        if (action === 'delete') {
            console.log('[Webhook Setup] Deleting webhook...');
            const response = await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`);
            return res.status(200).json({
                success: true,
                message: 'Telegram webhook removed successfully.',
                details: response.data
            });
        }
        
        // Register webhook URL with Telegram
        console.log(`[Webhook Setup] Registering webhook url to: ${webhookUrl}`);
        const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query']
        });
        
        return res.status(200).json({
            success: true,
            message: `Telegram webhook set successfully to: ${webhookUrl}`,
            details: response.data
        });
    } catch (err: any) {
        console.error('[Webhook Setup Error]:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to manage Telegram webhook configuration.',
            details: err.response?.data || err.message
        });
    }
};
