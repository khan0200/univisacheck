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

        if (!pdfUrlParam) {
            res.status(400).json({ error: 'Missing url parameter. Refresh the student status first so a PDF link can be found.' });
            return;
        }

        let parsedTarget;
        try {
            parsedTarget = new URL(pdfUrlParam);
        } catch {
            res.status(400).json({ error: 'Invalid PDF URL' });
            return;
        }

        if (!parsedTarget.hostname.endsWith('visamasters.uz')) {
            res.status(403).json({ error: 'Forbidden: URL must be from visamasters.uz' });
            return;
        }

        let csrf;
        try { csrf = await getCSRF(); } catch (e) {
            csrfCache.token = null;
            csrf = await getCSRF();
        }

        console.log(`[Vercel PDF] Fetching: ${pdfUrlParam}`);

        const options = {
            hostname: parsedTarget.hostname,
            port: 443,
            path: parsedTarget.pathname + parsedTarget.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/pdf,*/*;q=0.8',
                'Referer': 'https://visamasters.uz/visa-status',
                'Cookie': csrf.cookies,
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
