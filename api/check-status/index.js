// Vercel Serverless Function - Base endpoint for /api/check-status
// This handles POST requests to initiate visa status checks
const https = require('https');

const API_HOST = 'visadoctors.uz';
const API_PATH = '/api/uz/visas/v2/check-status/';

// Security Configuration - Allowed Origins
const ALLOWED_ORIGINS = [
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
];

module.exports = async (req, res) => {
    // CORS headers with origin validation
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));

    if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*'); // Fallback for development
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const targetPath = API_PATH;

    console.log(`[Vercel Proxy] ${req.method} /api/check-status -> https://${API_HOST}${targetPath}`);

    return new Promise((resolve) => {
        const options = {
            hostname: API_HOST,
            port: 443,
            path: targetPath,
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': `https://${API_HOST}`,
                'Referer': `https://${API_HOST}/visa-status`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            let data = '';

            proxyRes.on('data', (chunk) => {
                data += chunk;
            });

            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode);

                // Forward relevant headers
                const headersToForward = ['content-type', 'content-length'];
                headersToForward.forEach(header => {
                    if (proxyRes.headers[header]) {
                        res.setHeader(header, proxyRes.headers[header]);
                    }
                });

                res.send(data);
                resolve();
            });
        });

        proxyReq.on('error', (error) => {
            console.error('[Vercel Proxy] Error:', error);
            res.status(500).json({
                error: error.message,
                details: 'Failed to connect to visa API'
            });
            resolve();
        });

        // Handle POST request body
        if (req.method === 'POST') {
            let body = '';

            if (req.body && typeof req.body === 'object') {
                body = JSON.stringify(req.body);
            } else if (req.body && typeof req.body === 'string') {
                body = req.body;
            }

            if (body) {
                proxyReq.write(body);
            }
        }

        proxyReq.end();
    });
};