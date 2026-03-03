// Vercel Serverless Function — /api/check-status
// Proxies visa status checks to visamasters.uz with CSRF handling.
// Returns JSON: { status, detail, applicationDate, rejectionReason }

const https = require('https');

const API_HOST = 'visamasters.uz';

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
];

// ── CSRF Cache (lives for the duration of this serverless instance warm period)
let csrfCache = { token: null, cookies: null, fetchedAt: 0, ttlMs: 4 * 60 * 1000 };

function httpsRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getCSRF() {
    const now = Date.now();
    if (csrfCache.token && csrfCache.cookies && (now - csrfCache.fetchedAt) < csrfCache.ttlMs) {
        return csrfCache;
    }

    const res = await httpsRequest({
        hostname: API_HOST, port: 443, path: '/visa-status', method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
    });

    const rawCookies = res.headers['set-cookie'] || [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    let token = null;
    const metaMatch = res.body.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    if (metaMatch) token = metaMatch[1];
    if (!token) {
        const inputMatch = res.body.match(/name="_csrf(?:-frontend)?"\s+value="([^"]+)"/i);
        if (inputMatch) token = inputMatch[1];
    }
    if (!token) throw new Error('Could not extract CSRF token from visamasters.uz');

    csrfCache = { token, cookies: cookieStr, fetchedAt: now, ttlMs: csrfCache.ttlMs };
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

function stripTags(str) {
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseVisaStatusHtml(html) {
    let status = 'Unknown', detail = '', applicationDate = '', rejectionReason = '';

    // ── Status title
    const titleMatch = html.match(/<h3[^>]*class="status-title"[^>]*>([\s\S]*?)<\/h3>/i)
                    || html.match(/class="status-title"[^>]*>([\s\S]*?)<\/h3>/i);
    const rawTitle = titleMatch ? stripTags(titleMatch[1]) : '';
    const titleLower = rawTitle.toLowerCase();

    // ── Background color from <style> block
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    let bgColor = '';
    if (styleMatch) {
        const rule = styleMatch[1].match(/\.status-header\s*\{([^}]+)\}/i);
        if (rule) {
            const bg = rule[1].match(/background(?:-color)?\s*:\s*([^;!\n]+)/i);
            if (bg) bgColor = bg[1].trim().toLowerCase();
        }
    }

    // ── Additional description text
    const addMatch = html.match(/id="additional-text-content"[^>]*>([\s\S]*?)<\/div>/i)
                  || html.match(/class="additional-text[^"]*"[^>]*>([\s\S]*?)<(?:\/div|p|button)/i);
    const additionalText = addMatch ? stripTags(addMatch[1]) : '';
    const addLower = additionalText.toLowerCase();

    // ── Title-to-status map
    const titleStatusMap = [
        { keywords: ['tasdiqlandi', 'tasdiqlangan', 'approved', 'ishlatilgan', 'berilgan', 'tayyor'], status: 'APPROVED' },
        { keywords: ['rad etildi', 'rad etilgan', 'rejected', 'bekor qilingan', 'cancelled'],         status: 'CANCELLED' },
        { keywords: ["ko'rib chiqilmoqda", "ko'rib", 'tayyorlanish', 'under review', 'jarayonda'],    status: 'UNDER REVIEW' },
        { keywords: ['ariza qabul qilingan', 'qabul qilingan', 'received', 'qabul'],                  status: 'APP/RECEIVED' },
        { keywords: ['topilmadi', 'not found', 'no visa', 'error', 'xato'],                           status: 'Pending' },
    ];

    const colorStatusMap = [
        { hex: ['#10b981', '#22c55e', '#16a34a', 'green'],                status: 'APPROVED' },
        { hex: ['#ef4444', '#dc2626', '#b91c1c', 'red'],                  status: 'CANCELLED' },
        { hex: ['#f59e0b', '#d97706', '#b45309', 'yellow', 'amber'],      status: 'APP/RECEIVED' },
        { hex: ['#3b82f6', '#2563eb', '#1d4ed8', 'blue'],                 status: 'UNDER REVIEW' },
        { hex: ['#6b7280', '#4b5563', 'gray', 'grey'],                    status: 'Pending' },
    ];

    // Priority 1: Title text
    for (const entry of titleStatusMap) {
        if (entry.keywords.some(k => titleLower.includes(k))) { status = entry.status; break; }
    }

    // Priority 2: Background color
    if (status === 'Unknown' && bgColor) {
        for (const entry of colorStatusMap) {
            if (entry.hex.some(h => bgColor.includes(h))) {
                status = entry.status;
                if (status === 'CANCELLED' && (addLower.includes('topilmadi') || addLower.includes('no visa') || addLower.includes('not found'))) {
                    status = 'Pending';
                }
                break;
            }
        }
    }

    // Priority 3: Description fallback
    if (status === 'Unknown') {
        if (addLower.includes('topilmadi') || addLower.includes('no visa') || addLower.includes('not found') || addLower.includes('xato')) {
            status = 'Pending';
        } else if (addLower.includes("ko'rib") || addLower.includes('konsullig') || addLower.includes('jarayond')) {
            status = 'UNDER REVIEW';
        }
    }

    // ── Application date — find "Ariza topshirilgan sana" label
    const appDateLabels = ['ariza topshirilgan sana', 'application date', 'ariza sanasi'];
    const detailItemRegex = /<div[^>]*class="detail-item"[^>]*>([\s\S]*?)<\/div>/gi;
    let detailMatch;
    while ((detailMatch = detailItemRegex.exec(html)) !== null) {
        const block = detailMatch[1];
        const labelM = block.match(/class="detail-label"[^>]*>([\s\S]*?)<\/span>/i);
        const valueM = block.match(/class="detail-value"[^>]*>([\s\S]*?)<\/span>/i);
        if (!labelM || !valueM) continue;
        const label = stripTags(labelM[1]).toLowerCase().trim();
        const value = stripTags(valueM[1]).trim();
        if (appDateLabels.some(l => label.includes(l))) { applicationDate = value; break; }
    }
    if (!applicationDate) {
        const htmlBody = html.replace(/<style>[\s\S]*?<\/style>/gi, '');
        const d = htmlBody.match(/(\d{4}-\d{2}-\d{2})/);
        if (d) applicationDate = d[1];
    }

    // ── Rejection reason from denied-section
    const deniedMatch = html.match(/class="denied-section"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
                     || html.match(/class="denied-section"[^>]*>([\s\S]*?)<\/div>/i);
    if (deniedMatch) {
        const block = deniedMatch[1];
        const innerDivs = [...block.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
        if (innerDivs.length >= 2) {
            rejectionReason = stripTags(innerDivs[1][1]).trim();
        } else if (innerDivs.length === 1) {
            const txt = stripTags(innerDivs[0][1]).trim();
            if (!txt.toLowerCase().includes('rad etish sababi')) rejectionReason = txt;
        }
        if (!rejectionReason) {
            rejectionReason = stripTags(block).replace(/rad etish sababi\s*:/i, '').trim();
        }
    }

    detail = additionalText || rawTitle;
    console.log(`[Vercel] title="${rawTitle}" bg="${bgColor}" → ${status}${rejectionReason ? ' | reason: ' + rejectionReason.substring(0, 60) : ''}`);
    return { status, detail, applicationDate, rejectionReason };
}

module.exports = async (req, res) => {
    // CORS
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const passport  = (body.passport_number || body.passport || '').toUpperCase().trim();
        const fullName  = (body.english_name    || body.full_name || '').toUpperCase().trim();
        const birthDate = (body.birth_date       || body.date_of_birth || '').trim();

        if (!passport || !fullName || !birthDate) {
            res.status(400).json({ error: 'Missing required fields: passport, english_name, birth_date' });
            return;
        }

        // Step 1: Get CSRF
        let csrf;
        try { csrf = await getCSRF(); }
        catch (e) {
            csrfCache.token = null;
            csrf = await getCSRF();
        }

        // Step 2: Build multipart form
        const boundary = '----VercelBoundary' + Math.random().toString(36).substr(2, 16);
        const formFields = { '_csrf-frontend': csrf.token, passport, full_name: fullName, date_of_birth: birthDate };
        const multipartBody = buildMultipartBody(formFields, boundary);

        const postOptions = {
            hostname: API_HOST, port: 443, path: '/site/check-visa', method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(multipartBody),
                'X-CSRF-Token': csrf.token,
                'X-PJAX': 'true',
                'X-PJAX-Container': '#visa-result',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://visamasters.uz/visa-status',
                'Origin': 'https://visamasters.uz',
                'Cookie': csrf.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        };

        console.log(`[Vercel] Checking visa for passport: ${passport}`);
        let apiRes = await httpsRequest(postOptions, multipartBody);

        // Retry on CSRF failure
        if (apiRes.statusCode === 400 || apiRes.statusCode === 403) {
            csrfCache.token = null;
            csrf = await getCSRF();
            const retryFields  = { ...formFields, '_csrf-frontend': csrf.token };
            const retryBody    = buildMultipartBody(retryFields, boundary);
            const retryOptions = { ...postOptions, headers: { ...postOptions.headers, 'X-CSRF-Token': csrf.token, 'Cookie': csrf.cookies, 'Content-Length': Buffer.byteLength(retryBody) } };
            apiRes = await httpsRequest(retryOptions, retryBody);
        }

        // Update cookies if refreshed
        const newCookies = apiRes.headers['set-cookie'];
        if (newCookies && newCookies.length > 0) {
            csrfCache.cookies = newCookies.map(c => c.split(';')[0]).join('; ');
        }

        const parsed = parseVisaStatusHtml(apiRes.body);
        res.status(200).json(parsed);

    } catch (err) {
        console.error('[Vercel] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};