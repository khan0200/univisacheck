// Vercel Serverless Function for CORS Proxy
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

    // Parse the URL to get the path after /api/check-status
    // Vercel rewrites /api/check-status/:path* to /api/check-status with query.path
    let relativePath = '';

    // Check if Vercel passed the path as a query parameter
    if (req.query && req.query.path) {
        // Handle array of path segments
        if (Array.isArray(req.query.path)) {
            relativePath = req.query.path.join('/');
        } else {
            relativePath = req.query.path;
        }
    } else {
        // Fallback: Parse from URL
        const urlPath = req.url || '';
        if (urlPath.includes('/api/check-status/')) {
            relativePath = urlPath.split('/api/check-status/')[1] || '';
        } else if (urlPath.includes('/check-status/')) {
            relativePath = urlPath.split('/check-status/')[1] || '';
        }

        // Remove query parameters if any
        relativePath = relativePath.split('?')[0];
    }

    const targetPath = API_PATH + relativePath;


    console.log(`[Vercel Proxy] ${req.method} ${req.url} -> https://${API_HOST}${targetPath}`);

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
                // Set response status
                res.status(proxyRes.statusCode);

                // Forward relevant headers
                const headersToForward = ['content-type', 'content-length'];
                headersToForward.forEach(header => {
                    if (proxyRes.headers[header]) {
                        res.setHeader(header, proxyRes.headers[header]);
                    }
                });

                // Send the response
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

            // Check if body is already parsed (Vercel does this automatically)
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