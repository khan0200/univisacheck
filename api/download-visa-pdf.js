const https = require('https');
const { checkVisaDirect, getSession } = require('../direct-visa-check');

const API_HOST = 'visamasters.uz';

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visatokorea.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
];

// ── CSRF Cache
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

module.exports = async (req, res) => {
    // CORS
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        const pdfUrlParam = (req.query.url || '').trim();
        const passportParam = (req.query.passport || '').trim().toUpperCase();
        const fullNameParam = (req.query.full_name || '').trim().toUpperCase();
        const birthParam = (req.query.birth_date || '').trim();

        if (!passportParam || !fullNameParam || !birthParam) {
            res.status(400).json({ error: 'Missing required parameters (passport, full_name, birth_date).' });
            return;
        }

        // Validate target URL if provided
        let parsedTarget = null;
        if (pdfUrlParam) {
            try {
                parsedTarget = new URL(pdfUrlParam);
            } catch {
                res.status(400).json({ error: 'Invalid PDF URL' });
                return;
            }
            if (!parsedTarget.hostname.endsWith('visamasters.uz') && !parsedTarget.hostname.endsWith('visa.go.kr')) {
                res.status(403).json({ error: 'Forbidden: URL must be from visamasters.uz or visa.go.kr' });
                return;
            }
        }

        if (!parsedTarget || parsedTarget.hostname.endsWith('visa.go.kr')) {
            // ── Direct visa.go.kr PDF Download ────────────────────────────
            console.log(`[Vercel PDF] Requesting direct download from visa.go.kr for ${passportParam}...`);

            // 1. Format date to YYYYMMDD
            const birthYmd = birthParam.replace(/-/g, '');

            let evSeq = '';
            let invSeq = '0';
            let applNo = '';

            // 2. Retrieve dynamic variables. If parsedTarget exists, use searchParams.
            // Otherwise, perform direct status check to populate session and get parameters!
            let cookies;

            if (parsedTarget) {
                evSeq = parsedTarget.searchParams.get('evSeq') || '';
                invSeq = parsedTarget.searchParams.get('invSeq') || '0';
                applNo = parsedTarget.searchParams.get('applNo') || '';
                cookies = await getSession(true);
            } else {
                console.log(`[Vercel PDF] No pdfUrl provided. Fetching fresh status check first for ${passportParam}...`);
                const directResult = await checkVisaDirect(passportParam, fullNameParam, birthParam);
                if (!directResult.found || !directResult.pdfUrl) {
                    res.status(404).json({ error: 'No visa record or PDF download parameters found on visa.go.kr.' });
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
                sBUSI_GB: 'PASS_NO',
                sBUSI_GBNO: passportParam,
                ssBUSI_GBNO: passportParam,
                sEK_NM: fullNameParam,
                sFROMDATE: birthParam, // YYYY-MM-DD format as expected by search form
                sMainPopUpGB: 'main',
            });

            const checkOptions = {
                hostname: 'www.visa.go.kr',
                port: 443,
                path: '/openPage.do?MENU_ID=10301',
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
                    'Origin': 'https://www.visa.go.kr',
                    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': String(Buffer.byteLength(checkBody)),
                    'Cookie': cookies,
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

            console.log(`[Vercel PDF] Downloading PDF from visa.go.kr using evSeq: ${evSeq}...`);
            const printOptions = {
                hostname: 'www.visa.go.kr',
                port: 443,
                path: '/biz/ap/ev/selectElectronicVisaPrint3.do',
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
                    'Origin': 'https://www.visa.go.kr',
                    'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': String(Buffer.byteLength(printBody)),
                    'Cookie': downloadCookies,
                }
            };

            const printReq = https.request(printOptions, (printRes) => {
                const contentType = printRes.headers['content-type'] || '';
                const statusCode = printRes.statusCode;

                console.log(`[Vercel PDF] visa.go.kr print response: ${statusCode} | Content-Type: ${contentType}`);

                if (statusCode !== 200) {
                    printRes.resume();
                    res.status(502).json({ error: `visa.go.kr print service returned HTTP ${statusCode}.` });
                    return;
                }

                if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                    let body = ''; printRes.on('data', c => { body += c; });
                    printRes.on('end', () => {
                        console.warn('[Vercel PDF] Non-PDF print response body:', body.substring(0, 300));
                        res.status(404).json({ error: 'visa.go.kr did not return a PDF file.' });
                    });
                    return;
                }

                const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                printRes.pipe(res);
            });

            printReq.on('error', (err) => {
                console.error('[Vercel PDF] Direct print request error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: err.message });
                }
            });
            printReq.write(printBody);
            printReq.end();
            return;
        }

        // ── visamasters.uz Fallback ──
        let csrf;
        try { csrf = await getCSRF(); } catch (e) {
            csrfCache.token = null;
            csrf = await getCSRF();
        }

        const boundary = '----VercelBoundary' + Math.random().toString(36).substr(2, 16);
        const formFields = { '_csrf-frontend': csrf.token, passport: passportParam, full_name: fullNameParam, date_of_birth: birthParam };
        const multipartBody = buildMultipartBody(formFields, boundary);

        const postOptions = {
            hostname: API_HOST, port: 443, path: '/site/check-visa', method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(multipartBody),
                'X-CSRF-Token': csrf.token, 'X-PJAX': 'true',
                'X-PJAX-Container': '#visa-result', 'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://visamasters.uz/visa-status',
                'Origin': 'https://visamasters.uz', 'Cookie': csrf.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        };

        console.log(`[Vercel PDF] Pre-populating session for ${passportParam}...`);
        const checkRes = await httpsRequest(postOptions, multipartBody);

        let downloadCookies = csrf.cookies;
        const newCookies = checkRes.headers['set-cookie'];
        if (newCookies && newCookies.length > 0) {
            downloadCookies = newCookies.map(c => c.split(';')[0]).join('; ');
        }

        console.log(`[Vercel PDF] Fetching PDF: ${pdfUrlParam}`);

        const options = {
            hostname: parsedTarget.hostname,
            port: 443,
            path: parsedTarget.pathname + parsedTarget.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/pdf,*/*;q=0.8',
                'Referer': 'https://visamasters.uz/visa-status',
                'Cookie': downloadCookies,
            }
        };

        const pdfReq = https.request(options, (pdfRes) => {
            const contentType = pdfRes.headers['content-type'] || '';
            const statusCode = pdfRes.statusCode;

            console.log(`[Vercel PDF] Response: ${statusCode} | Content-Type: ${contentType}`);

            if ((statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) && pdfRes.headers.location) {
                pdfRes.resume();
                const redirectUrl = pdfRes.headers.location.startsWith('http')
                    ? pdfRes.headers.location
                    : `https://visamasters.uz${pdfRes.headers.location}`;
                console.log(`[Vercel PDF] Redirecting to: ${redirectUrl}`);
                const rParsed = new URL(redirectUrl);
                const rOptions = { ...options, hostname: rParsed.hostname, path: rParsed.pathname + rParsed.search };

                const rReq = https.request(rOptions, (rRes) => {
                    const rct = rRes.headers['content-type'] || '';
                    if (!rct.includes('pdf') && !rct.includes('octet-stream')) {
                        let body = ''; rRes.on('data', c => { body += c; });
                        rRes.on('end', () => {
                            console.warn('[Vercel PDF] Redirect response is not PDF:', body.substring(0, 300));
                            res.status(404).json({ error: 'PDF not available from the server after redirect.' });
                        });
                        return;
                    }
                    const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    rRes.pipe(res);
                });
                rReq.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
                rReq.end();
                return;
            }

            if (statusCode !== 200) {
                pdfRes.resume();
                res.status(502).json({ error: `Upstream returned HTTP ${statusCode}. Try refreshing the student status first.` });
                return;
            }

            if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                let body = ''; pdfRes.on('data', c => { body += c; });
                pdfRes.on('end', () => {
                    console.warn('[Vercel PDF] Non-PDF response body:', body.substring(0, 300));
                    res.status(404).json({ error: 'The server did not return a PDF file. The visa document may not be ready yet.' });
                });
                return;
            }

            const filename = passportParam ? `visa_${passportParam}.pdf` : 'visa.pdf';
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            pdfRes.pipe(res);
        });

        pdfReq.on('error', (err) => {
            console.error('[Vercel PDF] Request error:', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        });
        pdfReq.end();

    } catch (err) {
        console.error('[Vercel PDF] Error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};
