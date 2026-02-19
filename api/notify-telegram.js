const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'https://visa-jk8j8v5y0-jasurbeks-projects-ab2f5c68.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501'
];

function setCors(req, res) {
    const origin = req.headers.origin || '';
    const allowed = ALLOWED_ORIGINS.some(item => origin.startsWith(item));
    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function escapeTelegramText(value) {
    return String(value || '').replace(/[<>&]/g, '');
}

function getStatusEmoji(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return '🔴';
    }

    if (normalized.includes('received') || normalized.includes('app/')) {
        return '🟠';
    }

    if (normalized.includes('under review')) {
        return '🔵';
    }

    return '🔷';
}

function getMessageTone(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized.includes('approved')) {
        return {
            header: '🟢 Visa Status Update',
            footer: '🎉 Congratulations!'
        };
    }

    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return {
            header: '🔴 Visa Status Update',
            footer: ''
        };
    }

    if (normalized.includes('received') || normalized.includes('app/')) {
        return {
            header: '🟠 Visa Status Update',
            footer: '⏳ Your application is in process.'
        };
    }

    if (normalized.includes('under review')) {
        return {
            header: '🔵 Visa Status Update',
            footer: '🔎 Your application is under review.'
        };
    }

    return {
        header: '🔷 Visa Status Update',
        footer: 'ℹ️ Status updated.'
    };
}

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        res.status(500).json({
            error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variable'
        });
        return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fullName = escapeTelegramText(body.fullName);
    const passport = escapeTelegramText(body.passport);
    const studentId = escapeTelegramText(body.studentId);
    const birthday = escapeTelegramText(body.birthday);
    const newStatus = escapeTelegramText(body.newStatus);
    const applicationDate = escapeTelegramText(body.applicationDate);
    const statusEmoji = getStatusEmoji(newStatus);
    const messageTone = getMessageTone(newStatus);
    const text = [
        messageTone.header,
        '',
        `👤 Name: ${fullName}`,
        studentId ? `🎓 Student ID: ${studentId}` : '🎓 Student ID: --',
        applicationDate ? `📅 Application Date: ${applicationDate}` : '📅 Application Date: --',
        '',
        `🔄 Visa status: ${statusEmoji} ${newStatus}`,
        messageTone.footer
    ].join('\n');

    try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true
            })
        });

        const telegramData = await telegramResponse.json();
        if (!telegramResponse.ok || !telegramData.ok) {
            res.status(502).json({
                error: 'Telegram API request failed',
                details: telegramData
            });
            return;
        }

        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to send Telegram message',
            details: error.message
        });
    }
};
