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

function normalizeStatus(status) {
    const s = String(status || '').trim().toLowerCase();
    if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) {
        return 'pending';
    }
    if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) {
        return 'approved';
    }
    if (s.includes('cancel') || s.includes('reject')) {
        return 'cancelled';
    }
    if (s.includes('received') || s.includes('app/')) {
        return 'received';
    }
    if (s.includes('under review')) {
        return 'under review';
    }
    return s;
}

function isSameStatus(status1, status2) {
    return normalizeStatus(status1) === normalizeStatus(status2);
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

function getStatusDescription(status, lang = 'uz') {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued')) {
        return lang === 'en' ? 'Congratulations 🎉' : 'Tabriklaymiz 🎉';
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
        return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.';
    }
    if (normalized.includes('received') || normalized.includes('app/')) {
        return lang === 'en' ? '⏳ Your application is being processed.' : '⏳ Arizangiz jarayonda.';
    }
    if (normalized.includes('under review')) {
        return lang === 'en' ? '🔎 Under review.' : '🔎 Ko\'rib chiqilmoqda.';
    }
    return lang === 'en' ? 'Status updated.' : 'Status yangilandi.';
}

function formatLastChecked(dateString, lang = 'uz') {
    const today = lang === 'en' ? 'Today' : 'Bugun';
    if (!dateString) return lang === 'en' ? 'Never' : 'Hech qachon';
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
            return `${today}, ${timePart}`;
        } else {
            const datePart = date.toLocaleDateString('en-US', {
                timeZone: 'Asia/Tashkent',
                month: 'short',
                day: 'numeric'
            });
            return `${datePart}, ${timePart}`;
        }
    } catch {
        return today;
    }
}

const { verifyToken } = require('./auth-helper');
const db = require('./db');

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

    // ── Require JWT authentication ─────────────────────────────────────────
    const authUser = verifyToken(req);
    if (!authUser || !authUser.userId) {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
        return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const passport = (body.passport || '').toUpperCase().trim();

    if (!passport) {
        res.status(400).json({ error: 'Missing passport in request body' });
        return;
    }

    // ── Look up ALL Telegram subscribers for this cabinet (with their lang) ─
    let subscribers = [];
    try {
        const subsResult = await db.execute({
            sql: `SELECT cs.telegram_id, COALESCE(cs.lang, 'uz') as lang
                  FROM cabinet_subscribers cs WHERE cs.cabinet_id = ?`,
            args: [authUser.userId]
        });
        subscribers = subsResult.rows.filter(r => r.telegram_id);
    } catch (dbErr) {
        console.error('[Notify Telegram] DB lookup error:', dbErr.message);
        res.status(500).json({ error: 'Database error looking up subscribers.' });
        return;
    }

    // ── If cabinet has no connected Telegram subscribers, skip silently ───
    if (subscribers.length === 0) {
        res.status(200).json({ ok: true, skipped: 'No Telegram subscribers connected to this cabinet' });
        return;
    }

    // ── Verify the student belongs to this user ───────────────────────────
    try {
        const studentResult = await db.execute({
            sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
            args: [passport, authUser.userId]
        });
        if (studentResult.rows.length === 0) {
            // Student not in this user's cabinet — do not notify
            res.status(200).json({ ok: true, skipped: 'Student not in your cabinet' });
            return;
        }
    } catch (dbErr) {
        console.error('[Notify Telegram] Student ownership check error:', dbErr.message);
        res.status(500).json({ error: 'Database error verifying student.' });
        return;
    }

    // ── Build and send the Telegram message ───────────────────────────────
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN environment variable' });
        return;
    }

    const fullName = escapeTelegramText(body.fullName);
    const visaType = escapeTelegramText(body.visaType || 'Embassy');
    const applicationNo = escapeTelegramText(body.applicationNo);
    const birthday = escapeTelegramText(body.birthday);
    const oldStatus = escapeTelegramText(body.oldStatus);
    const newStatus = escapeTelegramText(body.newStatus);
    const applicationDate = escapeTelegramText(body.applicationDate);
    const rejectionReason = escapeTelegramText(body.rejectionReason);
    const previousRejectionReason = escapeTelegramText(body.previousRejectionReason);
    const invitingCompany = escapeTelegramText(body.invitingCompany);

    if (oldStatus && isSameStatus(oldStatus, newStatus)) {
        res.status(200).json({ ok: true, skipped: 'No actual status change (Pending and Unknown are equivalent)' });
        return;
    }

    const emoji = getStatusEmoji(newStatus);
    const isApproved = ['approved', 'visa used', 'issued'].some(s => newStatus.toLowerCase().includes(s));
    const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa';
    const nowIso = new Date().toISOString();

    // ── Helper: build localised message text for one subscriber ──────────
    function buildMessage(lang) {
        const desc = getStatusDescription(newStatus, lang);
        const checkedStr = formatLastChecked(nowIso, lang);
        const labels = {
            title:     lang === 'en' ? '🔍 Visa Status Check'             : '🔍 Visa statusini tekshirish',
            visaLbl:   lang === 'en' ? '✈️ Visa type:'                     : '✈️ Visa turi:',
            partner:   lang === 'en' ? '🏢 Partner:'                       : '🏢 Taklif:',
            appNo:     lang === 'en' ? '📄 Application No:'                : '📄 Ariza raqami:',
            submitted: lang === 'en' ? '📅 Submitted date:'                : '📅 Topshirilgan sana:',
            status:    lang === 'en' ? '🔄 Status:'                        : '🔄 Holati:',
            givenDate: lang === 'en' ? '🗓️ Visa given date:'             : '🗓️ Visa berilgan sana:',
            checked:   lang === 'en' ? '🕒 Checked:'                         : '🕒 Tekshirildi:',
            result:    lang === 'en' ? 'Result:'                           : 'Natija:',
            reason:    lang === 'en' ? '⚠️ Reason:'                        : '⚠️ Sababi:',
            prevResult:lang === 'en' ? 'Previous application result:\n🚫 Reason:' : 'Bundan oldingi ariza natijasi:\n🚫 Sababi:',
        };
        return [
            labels.title, '',
            `👤 ${fullName.toUpperCase()}`,
            `🛂 ${passport.toUpperCase()}`,
            `🎂 ${birthday}`, '',
            `${labels.visaLbl} ${visaType === 'E-Visa' ? 'E-Visa' : 'Embassy'}`,
            ...(visaType === 'E-Visa' && invitingCompany ? [`${labels.partner} ${invitingCompany}`] : []),
            ...(visaType === 'E-Visa' && applicationNo   ? [`${labels.appNo} ${applicationNo}`]     : []),
            `${labels.submitted} ${applicationDate || 'N/A'}`,
            `${labels.status} ${emoji} ${newStatus.toUpperCase()}`,
            ...(isApproved ? [`${labels.givenDate} ${escapeTelegramText(body.entryDate || applicationDate || 'N/A')}`] : (body.entryDate ? [`${labels.givenDate} ${escapeTelegramText(body.entryDate)}`] : [])),
            '',
            `${labels.checked} ${checkedStr}`, '',
            `${labels.result} ${desc}`,
            ...(rejectionReason         ? [`${labels.reason} ${rejectionReason}`]                          : []),
            ...(previousRejectionReason ? [`\n${labels.prevResult} ${previousRejectionReason}`]            : []),
        ].join('\n');
    }

    // ── Build per-subscriber reply_markup ────────────────────────────────
    function buildMarkup(lang) {
        const refreshBtn = lang === 'en' ? '🔄 Refresh'     : '🔄 Yangilash';
        const pdfBtn     = lang === 'en' ? '📥 Visa (pdf)'  : '📥 Viza (pdf)';
        return {
            inline_keyboard: canDownloadPdf
                ? [
                    [{ text: refreshBtn, callback_data: `refresh:${passport}` }],
                    [{ text: pdfBtn,     callback_data: `download_pdf:${passport}` }]
                  ]
                : [
                    [{ text: refreshBtn, callback_data: `refresh:${passport}` }]
                  ]
        };
    }

    // ── Send message to EACH subscriber in their own language ─────────────
    const results = await Promise.allSettled(
        subscribers.map(({ telegram_id: chatId, lang }) => {
            const msgText    = buildMessage(lang || 'uz');
            const reply_markup = buildMarkup(lang || 'uz');
            return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msgText,
                    parse_mode: 'Markdown',
                    reply_markup,
                    disable_web_page_preview: true
                })
            }).then(r => r.json());
        })
    );

    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.ok));
    if (failed.length > 0) {
        console.error('[Notify Telegram] Some sends failed:', failed.length);
    }

    res.status(200).json({
        ok: true,
        notified: subscribers.length,
        failed: failed.length
    });
};

