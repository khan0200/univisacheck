const http = require('http');
const https = require('https');
const path = require('path');

const PORT = 3000;
const API_HOST = 'visamasters.uz';

// ── Telegram credentials (local only, NOT committed to git) ──────────────────
// Edit telegram.config.js to add your bot token and chat ID.
let TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
try {
    const tgConfig = require(path.join(__dirname, 'telegram.config.js'));
    if (tgConfig.TELEGRAM_BOT_TOKEN) TELEGRAM_BOT_TOKEN = tgConfig.TELEGRAM_BOT_TOKEN;
    if (tgConfig.TELEGRAM_CHAT_ID)   TELEGRAM_CHAT_ID   = tgConfig.TELEGRAM_CHAT_ID;
} catch (_) { /* telegram.config.js not found — that's OK */ }

// Security Configuration
const ALLOWED_ORIGINS = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:3000',
    'file://',
];

// --- CSRF Token Cache ---
let csrfCache = {
    token: null,
    cookies: null,
    fetchedAt: 0,
    ttlMs: 5 * 60 * 1000 // 5 minutes
};

function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

function httpsPost(path, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: 443,
            path,
            method: 'POST',
            headers
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function getCSRF() {
    const now = Date.now();
    if (csrfCache.token && csrfCache.cookies && (now - csrfCache.fetchedAt) < csrfCache.ttlMs) {
        console.log('[CSRF] Using cached CSRF token');
        return csrfCache;
    }

    console.log('[CSRF] Fetching fresh CSRF token from visamasters.uz/visa-status...');
    const res = await httpsGet('https://visamasters.uz/visa-status');

    // Extract Set-Cookie headers
    const rawCookies = res.headers['set-cookie'] || [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Extract CSRF token from meta tag or hidden input
    let token = null;
    const metaMatch = res.body.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    if (metaMatch) token = metaMatch[1];

    if (!token) {
        const inputMatch = res.body.match(/name="_csrf(?:-frontend)?"\s+value="([^"]+)"/i);
        if (inputMatch) token = inputMatch[1];
    }

    if (!token) {
        throw new Error('Could not extract CSRF token from visamasters.uz');
    }

    csrfCache = { token, cookies: cookieStr, fetchedAt: now, ttlMs: csrfCache.ttlMs };
    console.log('[CSRF] Got fresh token:', token.substring(0, 20) + '...');
    return csrfCache;
}

function buildMultipartBody(fields, boundary) {
    let body = '';
    for (const [name, value] of Object.entries(fields)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
        body += `${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;
    return body;
}

function parseVisaStatusHtml(html) {
    const stripTags = str => str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    let status = 'Unknown';
    let detail = '';
    let applicationDate = '';

    // ── 1. Hidden input: <input type="hidden" id="visa-status" value="X">
    //    visamasters.uz sets this to a numeric code for the visa status.
    //    Observed values: 0=no app/error, 1=under review/received, 2=approved, 3=rejected/cancelled
    const hiddenMatch = html.match(/id="visa-status"\s+value="(\d+)"/i)
                     || html.match(/value="(\d+)"\s+id="visa-status"/i);
    const visaStatusCode = hiddenMatch ? parseInt(hiddenMatch[1], 10) : null;

    // ── 2. Status title text (in Uzbek)
    const titleMatch = html.match(/<h3[^>]*class="status-title"[^>]*>([\s\S]*?)<\/h3>/i)
                    || html.match(/class="status-title"[^>]*>([\s\S]*?)<\/h3>/i);
    const rawTitle = titleMatch ? stripTags(titleMatch[1]) : '';
    const titleLower = rawTitle.toLowerCase();

    // ── 3. Background color from inline <style> block (not inline on element!)
    //    The .status-header rule in the embedded <style> contains the color.
    const styleBlockMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    let bgColor = '';
    if (styleBlockMatch) {
        const statusHeaderRule = styleBlockMatch[1].match(/\.status-header\s*\{([^}]+)\}/i);
        if (statusHeaderRule) {
            const bgMatch = statusHeaderRule[1].match(/background(?:-color)?\s*:\s*([^;!\n]+)/i);
            if (bgMatch) bgColor = bgMatch[1].trim().toLowerCase();
        }
    }

    // ── 4. Additional text (description below title)
    const additionalMatch = html.match(/id="additional-text-content"[^>]*>([\s\S]*?)<\/div>/i)
                         || html.match(/class="additional-text[^"]*"[^>]*>([\s\S]*?)<(?:\/div|p|button)/i);
    const additionalText = additionalMatch ? stripTags(additionalMatch[1]) : '';
    const addLower = additionalText.toLowerCase();


    // ── 5. Determine Status — Priority: hidden code → title text → background color

    // Map Uzbek title keywords → English status
    const titleStatusMap = [
        // APPROVED
        { keywords: ['tasdiqlangan', 'approved', 'ishlatilgan', 'berilgan', 'tayyor'],        status: 'APPROVED' },
        // REJECTED / CANCELLED
        { keywords: ['rad etilgan', 'rejected', 'bekor qilingan', 'cancelled', 'rad'],         status: 'CANCELLED' },
        // UNDER REVIEW
        { keywords: ["ko'rib chiqilmoqda", "ko'rib", 'tayyorlanish', 'under review', 'jarayonda', 'review'], status: 'UNDER REVIEW' },
        // APPLICATION RECEIVED / IN PROCESS
        { keywords: ['ariza qabul qilingan', 'qabul qilingan', 'received', 'qabul'],           status: 'APP/RECEIVED' },
        // PENDING / NOT FOUND
        { keywords: ['topilmadi', 'not found', 'no visa', 'error', 'xato'],                    status: 'Pending' },
    ];

    // Map background color hex → English status
    const colorStatusMap = [
        { hex: ['#10b981', '#22c55e', '#16a34a', 'green'],  status: 'APPROVED' },
        { hex: ['#ef4444', '#dc2626', '#b91c1c', 'red'],    status: 'CANCELLED' },
        { hex: ['#f59e0b', '#d97706', '#b45309', 'yellow', 'amber'], status: 'APP/RECEIVED' },
        { hex: ['#3b82f6', '#2563eb', '#1d4ed8', 'blue'],   status: 'UNDER REVIEW' },
        { hex: ['#6b7280', '#4b5563', 'gray', 'grey'],      status: 'Pending' },
    ];


    // NOTE: The visa-status hidden input (visaCode) is NOT reliable:
    //   visaCode=0 appears for BOTH "application received" AND "no visa found" cases.
    //   Only use title text + background color for determining status.
    // (visaStatusCode is kept for future debugging purposes)

    // Priority 2: Status title text (Uzbek/English keywords)
    if (status === 'Unknown') {
        for (const entry of titleStatusMap) {
            if (entry.keywords.some(k => titleLower.includes(k))) {
                status = entry.status;
                break;
            }
        }
    }

    // Priority 3: Background color from CSS style block
    if (status === 'Unknown' && bgColor) {
        for (const entry of colorStatusMap) {
            if (entry.hex.some(h => bgColor.includes(h))) {
                status = entry.status;
                // If red and "no visa found" in description → Pending, not Cancelled
                if (status === 'CANCELLED' && (addLower.includes('topilmadi') || addLower.includes('no visa') || addLower.includes('not found'))) {
                    status = 'Pending';
                }
                break;
            }
        }
    }

    // Priority 4: Description text fallback
    if (status === 'Unknown') {
        if (addLower.includes('topilmadi') || addLower.includes('no visa') || addLower.includes('not found') || addLower.includes('xato')) {
            status = 'Pending';
        } else if (addLower.includes("ko'rib") || addLower.includes('konsullig') || addLower.includes('jarayond')) {
            status = 'UNDER REVIEW';
        }
    }

    // ── 6. Extract APPLICATION DATE specifically from "Ariza topshirilgan sana" label
    //    The HTML has multiple dates (application date, issue date, expiry date).
    //    We must find the one paired with the "Ariza topshirilgan sana" label.
    //
    //    Pattern:
    //    <span class="detail-label">Ariza topshirilgan sana</span>
    //    <span class="detail-value">2026-02-11</span>

    // Strategy: find a detail-item block that contains the application-date label
    const appDateLabels = [
        'ariza topshirilgan sana',   // "application submission date" (Uzbek)
        'application date',
        'ariza sanasi',
    ];

    // Extract all detail-item blocks
    const detailItemRegex = /<div[^>]*class="detail-item"[^>]*>([\s\S]*?)<\/div>/gi;
    let detailMatch;
    while ((detailMatch = detailItemRegex.exec(html)) !== null) {
        const block = detailMatch[1];
        const labelMatch = block.match(/class="detail-label"[^>]*>([\s\S]*?)<\/span>/i);
        const valueMatch = block.match(/class="detail-value"[^>]*>([\s\S]*?)<\/span>/i);
        if (!labelMatch || !valueMatch) continue;
        const label = stripTags(labelMatch[1]).toLowerCase().trim();
        const value = stripTags(valueMatch[1]).trim();
        if (appDateLabels.some(l => label.includes(l))) {
            applicationDate = value;
            break;
        }
    }

    // Fallback: first YYYY-MM-DD date found in the HTML body (outside style block)
    if (!applicationDate) {
        const htmlBody = html.replace(/<style>[\s\S]*?<\/style>/gi, '');
        const firstDate = htmlBody.match(/(\d{4}-\d{2}-\d{2})/);
        if (firstDate) applicationDate = firstDate[1];
    }

    // ── 7. Extract REJECTION REASON from denied-section (only for cancelled visas)
    //    HTML pattern:
    //    <div class="denied-section">
    //        <div style="font-weight: 700; ...">Rad etish sababi:</div>
    //        <div>7. Your purpose of entry...</div>
    //    </div>
    let rejectionReason = '';
    const deniedSectionMatch = html.match(/class="denied-section"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
                             || html.match(/class="denied-section"[^>]*>([\s\S]*?)<\/div>/i);
    if (deniedSectionMatch) {
        const deniedBlock = deniedSectionMatch[1];
        // The section has two inner divs: first is the "Rad etish sababi:" heading, second is the actual reason
        const innerDivs = [...deniedBlock.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
        if (innerDivs.length >= 2) {
            // Second div contains the reason text
            rejectionReason = stripTags(innerDivs[1][1]).trim();
        } else if (innerDivs.length === 1) {
            // Only one div — may contain the reason directly
            const text = stripTags(innerDivs[0][1]).trim();
            if (!text.toLowerCase().includes('rad etish sababi')) {
                rejectionReason = text;
            }
        }
        // Fallback: grab all text from the denied block, strip heading
        if (!rejectionReason) {
            rejectionReason = stripTags(deniedBlock)
                .replace(/rad etish sababi\s*:/i, '')
                .trim();
        }
    }

    detail = additionalText || rawTitle;

    console.log(`[Parser] visaCode=${visaStatusCode} | title="${rawTitle}" | bg="${bgColor}" | status→${status}${rejectionReason ? ' | reason: ' + rejectionReason.substring(0, 60) + '...' : ''}`);

    return { status, detail, applicationDate, rejectionReason, rawHtml: html };
}


const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || req.headers.referer || 'file://';
    const isAllowed = ALLOWED_ORIGINS.some(allowed =>
        origin.startsWith(allowed) || origin === allowed
    );

    if (isAllowed || origin.startsWith('file://')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        console.warn(`Blocked request from unauthorized origin: ${origin}`);
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/check-status') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1e6) req.connection.destroy();
        });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const passport = payload.passport_number || payload.passport || '';
                const fullName = payload.english_name || payload.full_name || '';
                const birthDate = payload.birth_date || payload.date_of_birth || '';

                if (!passport || !fullName || !birthDate) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing required fields: passport, full_name, birth_date' }));
                    return;
                }

                // Step 1: Get CSRF token
                let csrf;
                try {
                    csrf = await getCSRF();
                } catch (e) {
                    console.error('[CSRF] Failed:', e.message);
                    // Retry once with a fresh fetch (invalidate cache)
                    csrfCache.token = null;
                    try {
                        csrf = await getCSRF();
                    } catch (e2) {
                        res.writeHead(502);
                        res.end(JSON.stringify({ error: 'Failed to get CSRF token: ' + e2.message }));
                        return;
                    }
                }

                // Step 2: Build multipart form
                const boundary = '----FormBoundary' + Math.random().toString(36).substr(2, 16);
                const formFields = {
                    '_csrf-frontend': csrf.token,
                    'passport': passport.toUpperCase(),
                    'full_name': fullName.toUpperCase(),
                    'date_of_birth': birthDate
                };
                const multipartBody = buildMultipartBody(formFields, boundary);

                const postHeaders = {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': Buffer.byteLength(multipartBody),
                    'X-CSRF-Token': csrf.token,
                    'X-PJAX': 'true',
                    'X-PJAX-Container': '#visa-result',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': 'https://visamasters.uz/visa-status',
                    'Origin': 'https://visamasters.uz',
                    'Cookie': csrf.cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                };

                console.log(`[Proxy] Checking visa for passport: ${passport}`);
                const apiRes = await httpsPost('/site/check-visa', postHeaders, multipartBody);

                // If CSRF failed (403), refresh token and retry once
                if (apiRes.statusCode === 400 || apiRes.statusCode === 403) {
                    console.warn('[Proxy] CSRF failed, refreshing token and retrying...');
                    csrfCache.token = null;
                    csrf = await getCSRF();

                    const retryFields = { ...formFields, '_csrf-frontend': csrf.token };
                    const retryBody = buildMultipartBody(retryFields, boundary);
                    const retryHeaders = { ...postHeaders, 'X-CSRF-Token': csrf.token, 'Cookie': csrf.cookies, 'Content-Length': Buffer.byteLength(retryBody) };
                    const retryRes = await httpsPost('/site/check-visa', retryHeaders, retryBody);

                    const parsed = parseVisaStatusHtml(retryRes.body);
                    console.log(`[Proxy] Retry result for ${passport}: ${parsed.status}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(parsed));
                    return;
                }

                // Update cookies from response if any
                const newCookies = apiRes.headers['set-cookie'];
                if (newCookies && newCookies.length > 0) {
                    const updatedCookies = newCookies.map(c => c.split(';')[0]).join('; ');
                    csrfCache.cookies = updatedCookies;
                }

                const parsed = parseVisaStatusHtml(apiRes.body);
                console.log(`[Proxy] Result for ${passport}: ${parsed.status} | ${parsed.detail}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(parsed));

            } catch (err) {
                console.error('[Proxy] Error:', err);
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });

    } else if (req.url.startsWith('/notify-telegram') && req.method === 'POST') {
        // ── Telegram Notification (local proxy mirrors api/notify-telegram.js) ──
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
                    console.warn('[Telegram] Missing credentials — fill in telegram.config.js');
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing Telegram credentials in telegram.config.js' }));
                    return;
                }

                const payload = JSON.parse(body);
                const { fullName = '', passport = '', studentId = '', newStatus = '', applicationDate = '' } = payload;

                const getEmoji = s => {
                    const l = s.toLowerCase();
                    if (l.includes('approved'))                        return '🟢';
                    if (l.includes('cancel') || l.includes('reject')) return '🔴';
                    if (l.includes('received') || l.includes('app/')) return '🟠';
                    if (l.includes('under review'))                    return '🔵';
                    return '🔷';
                };

                const getHeader = s => {
                    const l = s.toLowerCase();
                    if (l.includes('approved'))                        return '🟢 Visa Status Update';
                    if (l.includes('cancel') || l.includes('reject')) return '🔴 Visa Status Update';
                    if (l.includes('received') || l.includes('app/')) return '🟠 Visa Status Update';
                    if (l.includes('under review'))                    return '🔵 Visa Status Update';
                    return '🔷 Visa Status Update';
                };

                const text = [
                    getHeader(newStatus),
                    '',
                    `👤 Name: ${fullName}`,
                    studentId ? `🎓 Student ID: ${studentId}` : '🎓 Student ID: --',
                    applicationDate ? `📅 Application Date: ${applicationDate}` : '📅 Application Date: --',
                    '',
                    `🔄 Visa status: ${getEmoji(newStatus)} ${newStatus}`,
                ].join('\n');

                const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
                });

                const tgData = await tgRes.json();
                if (!tgRes.ok || !tgData.ok) {
                    console.error('[Telegram] API error:', tgData);
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Telegram API error', details: tgData }));
                    return;
                }

                console.log(`[Telegram] ✅ Sent notification for ${fullName} → ${newStatus}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));

            } catch (err) {
                console.error('[Telegram] Error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });

    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Visamasters Proxy running at http://localhost:${PORT}`);
    console.log(`📡 Endpoint: POST http://localhost:${PORT}/check-status`);
    console.log(`📬 Telegram: POST http://localhost:${PORT}/notify-telegram`);
    console.log(`🔗 Proxying to: https://${API_HOST}/site/check-visa\n`);

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('⚠️  Telegram credentials not set. Edit telegram.config.js to enable local notifications.\n');
    } else {
        console.log('✅ Telegram notifications enabled.\n');
    }
});
