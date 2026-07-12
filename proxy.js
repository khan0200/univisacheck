const http = require('http');
const https = require('https');
const path = require('path');
const db = require('./api/db');
const authHandler = require('./api/auth');
const { checkVisaDirect } = require('./direct-visa-check');

const PORT = 3000;
const API_HOST = 'visamasters.uz'; // kept for legacy helpers only

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
        { keywords: ['tasdiqlangan', 'approved', 'berilgan', 'tayyor'],        status: 'APPROVED' },
        // VISA USED
        { keywords: ['ishlatilgan'],                                           status: 'VISA USED' },
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

    // ── 8. Extract PDF download URL ───────────────────────────────────────────
    let pdfUrl = '';

    // DEBUG: log every href found in the HTML so we know what pattern to match
    const allHrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);
    console.log('[Parser] All hrefs in response:', allHrefs.filter(h => !h.startsWith('#') && !h.includes('cdn') && !h.includes('font')).slice(0, 20));

    // Pattern A: plain anchor href containing "download"
    const hrefMatch =
        html.match(/href="([^"]*download[^"]*)\"/i) ||
        html.match(/href="([^"]*\.pdf[^"]*)"/i);
    if (hrefMatch) {
        const raw = hrefMatch[1];
        pdfUrl = raw.startsWith('http') ? raw : `https://visamasters.uz${raw.startsWith('/') ? '' : '/'}${raw}`;
        console.log('[Parser] PDF URL found via href pattern:', pdfUrl);
    }

    // Pattern B: onclick="window.location=..." or onclick="downloadVisa(...)" etc.
    if (!pdfUrl) {
        const onclickMatch = html.match(/onclick="[^"]*(?:location(?:\.href)?\s*=\s*|window\.open\s*\()\s*['"]([^'"]+)['"]/i);
        if (onclickMatch) {
            const raw = onclickMatch[1];
            pdfUrl = raw.startsWith('http') ? raw : `https://visamasters.uz${raw.startsWith('/') ? '' : '/'}${raw}`;
            console.log('[Parser] PDF URL found via onclick pattern:', pdfUrl);
        }
    }

    // Pattern C: data-url / data-href / data-download attribute on download button
    if (!pdfUrl) {
        const dataMatch = html.match(/class="[^"]*download[^"]*"[^>]*data-(?:url|href|src|download)="([^"]+)"/i)
                       || html.match(/data-(?:url|href|src|download)="([^"]+)"[^>]*class="[^"]*download[^"]*"/i);
        if (dataMatch) {
            const raw = dataMatch[1];
            pdfUrl = raw.startsWith('http') ? raw : `https://visamasters.uz${raw.startsWith('/') ? '' : '/'}${raw}`;
            console.log('[Parser] PDF URL found via data-* attribute:', pdfUrl);
        }
    }

    // Pattern D: <script> block containing fetch('/site/...') or location.href near "Download"
    if (!pdfUrl) {
        // Find the <!-- Scripts for Download --> section and everything after it in script tags
        const downloadScriptMatch = html.match(/<!--[^-]*[Dd]ownload[^-]*-->([\s\S]*?)<\/script>/i)
                                  || html.match(/<script>([\s\S]*?(?:download|pdf)[\s\S]*?)<\/script>/i);
        if (downloadScriptMatch) {
            const scriptContent = downloadScriptMatch[1];
            console.log('[Parser] Download script content:', scriptContent.substring(0, 500));
            // Look for URL strings inside the script
            const urlInScript = scriptContent.match(/['"](\/?site\/[^'"]+)['"]/i)
                             || scriptContent.match(/fetch\(['"]([^'"]+)['"]/i)
                             || scriptContent.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i)
                             || scriptContent.match(/['"]([^'"]*download[^'"]*)['"]/i);
            if (urlInScript) {
                const raw = urlInScript[1];
                pdfUrl = raw.startsWith('http') ? raw : `https://visamasters.uz${raw.startsWith('/') ? '' : '/'}${raw}`;
                console.log('[Parser] PDF URL found in download script:', pdfUrl);
            }
        }
    }

    // Pattern E: any URL in ALL script blocks containing 'download' or 'pdf'
    if (!pdfUrl) {
        const allScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
        for (const script of allScripts) {
            if (!script.toLowerCase().includes('download') && !script.toLowerCase().includes('pdf')) continue;
            console.log('[Parser] Checking script block for PDF URL:', script.substring(0, 300));
            const urlMatch = script.match(/['"](\/?(?:site|api|uploads)\/[^'"]*(?:download|pdf|visa)[^'"]*)['"]/i)
                          || script.match(/fetch\(['"]([^'"]+)['"]/i);
            if (urlMatch) {
                const raw = urlMatch[1];
                pdfUrl = raw.startsWith('http') ? raw : `https://visamasters.uz${raw.startsWith('/') ? '' : '/'}${raw}`;
                console.log('[Parser] PDF URL found in script block:', pdfUrl);
                break;
            }
        }
    }

    console.log(`[Parser] visaCode=${visaStatusCode} | title="${rawTitle}" | bg="${bgColor}" | status→${status}${rejectionReason ? ' | reason: ' + rejectionReason.substring(0, 60) + '...' : ''}${pdfUrl ? ' | pdfUrl: ' + pdfUrl : ' | pdfUrl: NOT FOUND IN HTML'}`);

    return { status, detail, applicationDate, rejectionReason, pdfUrl, rawHtml: html };
}

async function updateStudentDb(passport, parsed, inputData = {}) {
    try {
        const lastChecked = new Date().toISOString();
        const apiResponse = JSON.stringify({
            status: parsed.status,
            detail: parsed.detail,
            visaExpiry: parsed.visaExpiry || '',
            visaKind: parsed.visaKind || '',
            statusOfResidence: parsed.statusOfResidence || '',
            entryDate: parsed.entryDate || '',
            entryPurpose: parsed.entryPurpose || '',
            invitingCompany: parsed.invitingCompany || ''
        });

        // Check if a record already exists for this passport (any user)
        const existing = await db.execute({
            sql: 'SELECT passport FROM students WHERE passport = ? LIMIT 1',
            args: [passport]
        });

        if (existing.rows.length > 0) {
            // Row exists — only refresh the status fields
            await db.execute({
                sql: `UPDATE students
                      SET status = ?, applicationDate = ?, rejectReason = ?,
                          pdfUrl = ?, apiResponse = ?, lastChecked = ?
                      WHERE passport = ?`,
                args: [
                    parsed.status || 'Pending',
                    parsed.applicationDate || '',
                    parsed.rejectionReason || '',
                    parsed.pdfUrl || '',
                    apiResponse,
                    lastChecked,
                    passport
                ]
            });
            console.log(`[Proxy DB Update] Updated status for ${passport} → ${parsed.status}`);
        } else {
            // New record — insert with full data so autofill works next time
            await db.execute({
                sql: `INSERT INTO students
                      (passport, fullName, birthday, studentId, status, lastChecked,
                       rejectReason, pdfUrl, apiResponse, batchSelected,
                       batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`,
                args: [
                    passport,
                    inputData.fullName    || '',
                    inputData.birthday    || '',
                    '',
                    parsed.status         || 'Pending',
                    lastChecked,
                    parsed.rejectionReason || '',
                    parsed.pdfUrl          || '',
                    apiResponse,
                    0,
                    '',
                    999999,
                    inputData.visaType    || 'Embassy',
                    inputData.applicationNo || ''
                ]
            });
            console.log(`[Proxy DB Insert] Saved new record for ${passport} → ${parsed.status}`);
        }
    } catch (dbErr) {
        console.error(`[Proxy DB Update] Failed to upsert Turso for ${passport}:`, dbErr.message);
    }
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

    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
                const passport = (payload.passport_number || payload.passport || '').toUpperCase().trim();
                const fullName = (payload.english_name || payload.full_name || '').toUpperCase().trim();
                const birthDate = (payload.birth_date || payload.date_of_birth || '').trim();
                const visaType = (payload.visa_type || payload.visaType || 'Embassy').trim();
                const applicationNo = (payload.application_no || payload.applicationNo || '').trim();

                if (!passport || !fullName || !birthDate) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing required fields: passport, full_name, birth_date' }));
                    return;
                }

                console.log(`[Direct] Checking visa.go.kr for passport: ${passport}, type: ${visaType}, appNo: ${applicationNo}`);

                // ── Direct visa.go.kr query (no middleman) ────────────────────
                const direct = await checkVisaDirect(passport, fullName, birthDate, visaType, applicationNo);

                // Map to the same shape the frontend already expects
                const parsed = {
                    status:          direct.latestStatus,
                    detail:          direct.latestStatusKorean || direct.latestStatus,
                    applicationDate: direct.latestDate || '',
                    rejectionReason: direct.rejectionReason || '',
                    pdfUrl:          direct.pdfUrl || '',
                    rawHtml:         '',
                    // Extra fields for future use
                    entryDate:       direct.entryDate || '',
                    entryPurpose:    direct.entryPurpose || '',
                    visaExpiry:      direct.visaExpiry || '',
                    visaKind:        direct.visaKind || '',
                    statusOfResidence: direct.statusOfResidence || '',
                    invitingCompany:  direct.invitingCompany || '',
                    resultCount:     direct.resultCount || 0,
                    source:          'visa.go.kr',
                };

                console.log(`[Direct] Result for ${passport}: ${parsed.status}`);
                // Save/update in Turso — inserts new record if passport never seen before
                await updateStudentDb(passport, parsed, {
                    fullName:      fullName,
                    birthday:      birthDate,
                    visaType:      visaType,
                    applicationNo: applicationNo,
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(parsed));

            } catch (err) {
                console.error('[Direct] Error:', err);
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
                const { fullName = '', passport = '', studentId = '', visaType = 'Embassy', applicationNo = '', newStatus = '', applicationDate = '' } = payload;

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
                    `✈️ Visa Type: ${visaType}`,
                    ...(applicationNo ? [`📄 Application No: ${applicationNo}`] : []),
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


    } else if (req.url.startsWith('/api/auth')) {
        // ── Auth route (signup / login / me) ─────────────────────────────────
        const urlParsed = new URL(req.url, `http://localhost:${PORT}`);
        req.query = Object.fromEntries(urlParsed.searchParams.entries());

        res.status = (statusCode) => { res.statusCode = statusCode; return res; };
        res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try { req.body = JSON.parse(body || '{}'); } catch { req.body = {}; }
                authHandler(req, res);
            });
        } else {
            authHandler(req, res);
        }

    } else if (req.url.startsWith('/api/students')) {
        // ── Students CRUD route ───────────────────────────────────────────────
        const urlParsed = new URL(req.url, `http://localhost:${PORT}`);
        req.query = Object.fromEntries(urlParsed.searchParams.entries());

        res.status = (statusCode) => {
            res.statusCode = statusCode;
            return res;
        };
        res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        };

        if (req.method === 'POST' || req.method === 'PATCH') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try { req.body = JSON.parse(body || '{}'); } catch { req.body = body; }
                const studentsHandler = require('./api/students');
                studentsHandler(req, res);
            });
        } else {
            const studentsHandler = require('./api/students');
            studentsHandler(req, res);
        }

    } else if (req.url.startsWith('/fetch-visa-pdfurl') && req.method === 'POST') {
        // ── Fetch PDF URL from visamasters.uz ────────────────────────────────
        // Called when student.pdfUrl is empty. Hits visamasters.uz check-visa
        // and extracts the PDF download link from the returned HTML.
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const passport  = (payload.passport  || payload.passport_number || '').toUpperCase().trim();
                const fullName  = (payload.full_name  || payload.english_name   || '').toUpperCase().trim();
                const birthDate = (payload.birth_date || '').trim();

                if (!passport || !fullName || !birthDate) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing passport, full_name, birth_date' }));
                    return;
                }

                let csrf;
                try { csrf = await getCSRF(); } catch (e) {
                    csrfCache.token = null;
                    csrf = await getCSRF();
                }

                const boundary = '----FormBoundary' + Math.random().toString(36).substr(2, 16);
                const formFields = { '_csrf-frontend': csrf.token, passport, full_name: fullName, date_of_birth: birthDate };
                const multipartBody = buildMultipartBody(formFields, boundary);
                const postHeaders = {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': Buffer.byteLength(multipartBody),
                    'X-CSRF-Token': csrf.token, 'X-PJAX': 'true',
                    'X-PJAX-Container': '#visa-result', 'X-Requested-With': 'XMLHttpRequest',
                    'Referer': 'https://visamasters.uz/visa-status',
                    'Origin': 'https://visamasters.uz', 'Cookie': csrf.cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,*/*;q=0.9',
                };

                console.log(`[FetchPDF] Fetching PDF URL from visamasters.uz for ${passport}...`);
                const apiRes = await httpsPost('/site/check-visa', postHeaders, multipartBody);
                const parsed = parseVisaStatusHtml(apiRes.body);
                const pdfUrl = parsed.pdfUrl || '';

                console.log(`[FetchPDF] PDF URL for ${passport}: ${pdfUrl || 'NOT FOUND'}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ pdfUrl }));

            } catch (err) {
                console.error('[FetchPDF] Error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });

    } else if (req.url.startsWith('/download-visa-pdf') && req.method === 'GET') {
        // ── Download Visa PDF ─────────────────────────────────────────────────
        // The frontend passes the exact PDF URL that was extracted from the
        // visamasters.uz HTML during the last visa check.  We proxy it with
        // the session cookies so the browser can download it directly.
        const urlParsed = new URL(req.url, `http://localhost:${PORT}`);
        const pdfUrlParam   = (urlParsed.searchParams.get('url') || '').trim();
        const passportParam = (urlParsed.searchParams.get('passport') || '').trim().toUpperCase();
        const fullNameParam = (urlParsed.searchParams.get('full_name') || '').trim().toUpperCase();
        const birthParam    = (urlParsed.searchParams.get('birth_date') || '').trim();
        const visaTypeParam = (urlParsed.searchParams.get('visa_type') || urlParsed.searchParams.get('visaType') || 'Embassy').trim();
        const applicationNoParam = (urlParsed.searchParams.get('application_no') || urlParsed.searchParams.get('applicationNo') || '').trim();

        if (!passportParam || !fullNameParam || !birthParam) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameters (passport, full_name, birth_date).' }));
            return;
        }

        // Validate it's a visamasters.uz or visa.go.kr URL if provided so we can't be used as an open proxy
        let parsedTarget = null;
        if (pdfUrlParam) {
            try {
                parsedTarget = new URL(pdfUrlParam);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid PDF URL' }));
                return;
            }
            if (!parsedTarget.hostname.endsWith('visamasters.uz') && !parsedTarget.hostname.endsWith('visa.go.kr')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: URL must be from visamasters.uz or visa.go.kr' }));
                return;
            }
        }

        try {
            if (!parsedTarget || parsedTarget.hostname.endsWith('visa.go.kr')) {
                // ── Direct visa.go.kr PDF Download ────────────────────────────
                console.log(`[PDF] Requesting direct download from visa.go.kr for ${passportParam}...`);
                
                // 1. Format date to YYYYMMDD
                const birthYmd = birthParam.replace(/-/g, '');
                
                let evSeq = '';
                let invSeq = '0';
                let applNo = '';

                // 2. Retrieve dynamic variables. If parsedTarget exists, use searchParams.
                // Otherwise, perform direct status check to populate session and get parameters!
                const { checkVisaDirect, getSession } = require('./direct-visa-check');
                let cookies;

                if (parsedTarget) {
                    evSeq = parsedTarget.searchParams.get('evSeq') || '';
                    invSeq = parsedTarget.searchParams.get('invSeq') || '0';
                    applNo = parsedTarget.searchParams.get('applNo') || '';
                    cookies = await getSession(true);
                } else {
                    console.log(`[PDF] No pdfUrl provided. Fetching fresh status check first for ${passportParam}...`);
                    const directResult = await checkVisaDirect(passportParam, fullNameParam, birthParam, visaTypeParam, applicationNoParam);
                    if (!directResult.found || !directResult.pdfUrl) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No visa record or PDF download parameters found on visa.go.kr.' }));
                        return;
                    }
                    const resultUrl = new URL(directResult.pdfUrl);
                    evSeq = resultUrl.searchParams.get('evSeq') || '';
                    invSeq = resultUrl.searchParams.get('invSeq') || '0';
                    applNo = resultUrl.searchParams.get('applNo') || '';
                    cookies = await getSession();
                }

                // 4. Pre-populate the session by performing the search POST request
                const querystring = require('querystring');
                const checkBody = querystring.stringify({
                    pRADIOSEARCH: 'gb03',
                    sBUSI_GB:     'PASS_NO',
                    sBUSI_GBNO:   passportParam,
                    ssBUSI_GBNO:  passportParam,
                    sEK_NM:       fullNameParam,
                    sFROMDATE:    birthParam, // YYYY-MM-DD format as expected by search form
                    sMainPopUpGB: 'main',
                });

                const checkOptions = {
                    hostname: 'www.visa.go.kr',
                    port: 443,
                    path: '/openPage.do?MENU_ID=10301',
                    method: 'POST',
                    headers: {
                        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                        'Referer':       'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
                        'Origin':        'https://www.visa.go.kr',
                        'Accept':        'text/html,application/xhtml+xml,*/*;q=0.9',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Content-Type':  'application/x-www-form-urlencoded',
                        'Content-Length': String(Buffer.byteLength(checkBody)),
                        'Cookie':         cookies,
                    }
                };

                const checkRes = await new Promise((resolve, reject) => {
                    const req = https.request(checkOptions, res => {
                        const chunks = [];
                        res.on('data', c => chunks.push(c));
                        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers }));
                    });
                    req.on('error', reject);
                    req.write(checkBody);
                    req.end();
                });

                let downloadCookies = cookies;
                if (checkRes.headers['set-cookie']) {
                    downloadCookies = checkRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                }

                // 5. Send POST to print servlet to download the PDF
                const printBody = querystring.stringify({
                    sBUSI_GB: 'PASS_NO',
                    sBUSI_GBNO: passportParam,
                    EV_SEQ: evSeq,
                    INVITEE_SEQ: invSeq,
                    APPL_NO: applNo,
                    ENG_NM: fullNameParam,
                    BIRTH_YMD: birthYmd,
                    IN_PHOTO: '/biz/ap/ev/selectInviteeXvarmImage.do',
                    TRAN_TYPE: 'ComSubmit',
                    SE_FLAG_YN: '',
                    LANG_TYPE: 'KO',
                    CMM_TEST_VAL: 'test'
                });

                console.log(`[PDF] Downloading PDF from visa.go.kr using evSeq: ${evSeq}...`);
                const printOptions = {
                    hostname: 'www.visa.go.kr',
                    port: 443,
                    path: '/biz/ap/ev/selectElectronicVisaPrint3.do',
                    method: 'POST',
                    headers: {
                        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                        'Referer':       'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
                        'Origin':        'https://www.visa.go.kr',
                        'Accept':        'text/html,application/xhtml+xml,application/pdf,*/*;q=0.9',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Content-Type':  'application/x-www-form-urlencoded',
                        'Content-Length': String(Buffer.byteLength(printBody)),
                        'Cookie':         downloadCookies,
                    }
                };

                const printReq = https.request(printOptions, (printRes) => {
                    const contentType = printRes.headers['content-type'] || '';
                    const statusCode  = printRes.statusCode;

                    console.log(`[PDF] visa.go.kr print response: ${statusCode} | Content-Type: ${contentType}`);

                    if (statusCode !== 200) {
                        printRes.resume();
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `visa.go.kr print service returned HTTP ${statusCode}.` }));
                        return;
                    }

                    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                        let body = ''; printRes.on('data', c => { body += c; });
                        printRes.on('end', () => {
                            console.warn('[PDF] Non-PDF print response body:', body.substring(0, 300));
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'visa.go.kr did not return a PDF file.' }));
                        });
                        return;
                    }

                    const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="${filename}"`
                    });
                    printRes.pipe(res);
                });

                printReq.on('error', (err) => {
                    console.error('[PDF] Direct print request error:', err.message);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
                printReq.write(printBody);
                printReq.end();
                return;
            }

            // 1. Get/reuse initial session cookies
            let csrf;
            try { csrf = await getCSRF(); } catch (e) {
                csrfCache.token = null;
                csrf = await getCSRF();
            }

            // 2. The critical fix: visamasters.uz requires the session to be populated
            // with the visa check result BEFORE it allows downloading the PDF.
            // If we just hit the PDF url with a fresh session, it returns HTTP 500.
            const boundary = '----FormBoundary' + Math.random().toString(36).substr(2, 16);
            const formFields = { '_csrf-frontend': csrf.token, passport: passportParam, full_name: fullNameParam, date_of_birth: birthParam };
            const multipartBody = buildMultipartBody(formFields, boundary);
            
            const postHeaders = {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(multipartBody),
                'X-CSRF-Token': csrf.token, 'X-PJAX': 'true',
                'X-PJAX-Container': '#visa-result', 'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://visamasters.uz/visa-status',
                'Origin': 'https://visamasters.uz', 'Cookie': csrf.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };
            
            console.log(`[PDF] Pre-populating session for ${passportParam}...`);
            const checkRes = await httpsPost('/site/check-visa', postHeaders, multipartBody);
            
            // Extract the session cookies that now contain the authorized visa record
            let downloadCookies = csrf.cookies;
            const newCookies = checkRes.headers['set-cookie'];
            if (newCookies && newCookies.length > 0) {
                downloadCookies = newCookies.map(c => c.split(';')[0]).join('; ');
            }

            console.log(`[PDF] Fetching PDF: ${pdfUrlParam}`);

            // 3. Guarantee we download the exact PDF requested using the populated session cookies
            const options = {
                hostname: parsedTarget.hostname,
                port: 443,
                path: parsedTarget.pathname + parsedTarget.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/pdf,*/*;q=0.8',
                    'Referer': 'https://visamasters.uz/visa-status',
                    'Cookie': downloadCookies,
                }
            };

            const pdfReq = https.request(options, (pdfRes) => {
                const contentType = pdfRes.headers['content-type'] || '';
                const statusCode  = pdfRes.statusCode;

                console.log(`[PDF] Response: ${statusCode} | Content-Type: ${contentType}`);

                // Follow a single redirect if the server sends one
                if ((statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) && pdfRes.headers.location) {
                    pdfRes.resume();
                    const redirectUrl = pdfRes.headers.location.startsWith('http')
                        ? pdfRes.headers.location
                        : `https://visamasters.uz${pdfRes.headers.location}`;
                    console.log(`[PDF] Redirecting to: ${redirectUrl}`);
                    const rParsed = new URL(redirectUrl);
                    const rOptions = { ...options, hostname: rParsed.hostname, path: rParsed.pathname + rParsed.search };
                    const rReq = https.request(rOptions, (rRes) => {
                        const rct = rRes.headers['content-type'] || '';
                        if (!rct.includes('pdf') && !rct.includes('octet-stream')) {
                            let body = ''; rRes.on('data', c => { body += c; });
                            rRes.on('end', () => {
                                console.warn('[PDF] Redirect response is not PDF:', body.substring(0, 300));
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'PDF not available from the server after redirect.' }));
                            });
                            return;
                        }
                        const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
                        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
                        rRes.pipe(res);
                    });
                    rReq.on('error', err => { if (!res.headersSent) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); } });
                    rReq.end();
                    return;
                }

                if (statusCode !== 200) {
                    pdfRes.resume();
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Upstream returned HTTP ${statusCode}. Try refreshing the student status first.` }));
                    return;
                }

                if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                    let body = ''; pdfRes.on('data', c => { body += c; });
                    pdfRes.on('end', () => {
                        console.warn('[PDF] Non-PDF response body:', body.substring(0, 300));
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'The server did not return a PDF file. The visa document may not be ready yet.' }));
                    });
                    return;
                }

                const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
                res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
                pdfRes.pipe(res);
            });

            pdfReq.on('error', (err) => {
                console.error('[PDF] Request error:', err.message);
                if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message })); }
            });
            pdfReq.end();

        } catch (err) {
            console.error('[PDF] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }

    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Local Dev Proxy running at http://localhost:${PORT}`);
    console.log(`📡 Endpoint: POST http://localhost:${PORT}/check-status`);
    console.log(`📬 Telegram: POST http://localhost:${PORT}/notify-telegram`);
    console.log(`🔗 Visa status checks and PDF downloads both go directly to visa.go.kr (visamasters.uz is only a last-resort fallback).\n`);

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('⚠️  Telegram credentials not set. Edit telegram.config.js to enable local notifications.\n');
    } else {
        console.log('✅ Telegram notifications enabled.\n');
    }
});
