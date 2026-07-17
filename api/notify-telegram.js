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

    if (normalized.includes('approved') || normalized.includes('visa used')) {
        return '🟢';
    }

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

function getStatusDescription(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued')) {
        return 'Tabriklaymiz 🎉';
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return 'Arizangiz rad etildi.';
    }
    if (normalized.includes('received') || normalized.includes('app/')) {
        return '⏳ Arizangiz jarayonda.';
    }
    if (normalized.includes('under review')) {
        return '🔎 Ko\'rib chiqilmoqda.';
    }
    return 'Status yangilandi.';
}

function formatLastChecked(dateString) {
    if (!dateString) return 'Hech qachon';
    const date = new Date(dateString);
    try {
        const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' });
        const dateStr = date.toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' });
        
        const timePart = date.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Tashkent',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        if (todayStr === dateStr) {
            return `Bugun, ${timePart}`;
        } else {
            const datePart = date.toLocaleDateString('en-US', {
                timeZone: 'Asia/Tashkent',
                month: 'short',
                day: 'numeric'
            });
            return `${datePart}, ${timePart}`;
        }
    } catch {
        return 'Bugun';
    }
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
    const visaType = escapeTelegramText(body.visaType || 'Embassy');
    const applicationNo = escapeTelegramText(body.applicationNo);
    const birthday = escapeTelegramText(body.birthday);
    const newStatus = escapeTelegramText(body.newStatus);
    const applicationDate = escapeTelegramText(body.applicationDate);
    const rejectionReason = escapeTelegramText(body.rejectionReason);
    const previousRejectionReason = escapeTelegramText(body.previousRejectionReason);
    const invitingCompany = escapeTelegramText(body.invitingCompany);

    const emoji = getStatusEmoji(newStatus);
    const desc = getStatusDescription(newStatus);
    const isApproved = ['approved', 'visa used', 'issued'].some(s => newStatus.toLowerCase().includes(s));
    const checkedStr = formatLastChecked(new Date().toISOString());

    const text = [
        `🔍 *Visa statusini tekshirish*`,
        ``,
        fullName.toUpperCase(),
        passport.toUpperCase(),
        birthday,
        ``,
        `✈️ *Visa turi:* ${visaType === 'E-Visa' ? 'E-Visa' : 'Embassy'}`,
        ...(visaType === 'E-Visa' && invitingCompany ? [`🏢 *Hamkor:* ${invitingCompany}`] : []),
        ...(visaType === 'E-Visa' && applicationNo ? [`📄 *Ariza raqami:* ${applicationNo}`] : []),
        `📅 *Topshirilgan sana:* ${applicationDate || 'N/A'}`,
        `🔄 *Holati:* ${emoji} *${newStatus.toUpperCase()}*`,
        `Tekshirildi: ${checkedStr}`,
        ``,
        `*Natija:* ${desc}`,
        ...(rejectionReason ? [`⚠️ *Sababi:* ${rejectionReason}`] : []),
        ...(previousRejectionReason ? [`\nBundan oldingi ariza natijasi:\n🚫 Sababi: ${previousRejectionReason}`] : []),
    ].join('\n');

    const reply_markup = {
        inline_keyboard: isApproved
            ? [
                [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }],
                [{ text: '📥 Viza (pdf)', callback_data: `download_pdf:${passport.toUpperCase().trim()}` }]
              ]
            : [
                [{ text: '🔄 Yangilash', callback_data: `mrefresh:${passport.toUpperCase().trim()}` }]
              ]
    };

    try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                reply_markup,
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
