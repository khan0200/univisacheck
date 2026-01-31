const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;
const API_HOST = 'visadoctors.uz';
const API_PATH = '/api/uz/visas/v2/check-status/';

// Security Configuration
// PRODUCTION: Change this to your actual domain (e.g., 'https://yourdomain.com')
const ALLOWED_ORIGINS = [
    'http://localhost:5500', // Live Server
    'http://127.0.0.1:5500',
    'http://localhost:5501', // Live Server alternate port
    'http://127.0.0.1:5501',
    'http://localhost:3000',
    'file://', // Local file access (development only)
];

const server = http.createServer((req, res) => {
    // Secure CORS for frontend
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

    // Handle /check-status requests
    if (req.url.startsWith('/check-status')) {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            // Prevent huge payloads
            if (body.length > 1e6) {
                req.connection.destroy();
            }
        });
        req.on('end', () => {
            // Forward Request
            // Remove the local prefix '/check-status'
            let relativePath = req.url.substring('/check-status'.length);

            // Ensure target path ends up cleaner (remove leading slash from relative if exists to avoid double slash with API_PATH)
            // But API_PATH is defined as '/api/uz/visas/v2/check-status/' (with trailing slash)
            // If relativePath is '/uuid', we get '...status//uuid'.

            // FIX: Remove leading slash from relativePath if present
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.substring(1);
            }

            // Combine: API_PATH (ends in /) + relativePath (no leading /)
            // If relativePath was empty (initial POST), we get '...status/'. Correct.
            // If relativePath was 'uuid/', we get '...status/uuid/'. Correct.
            const targetPath = API_PATH + relativePath;

            console.log(`Proxying: ${req.url} -> ${targetPath}`); // Debug log

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
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res, {
                    end: true
                });
            });

            proxyReq.on('error', (e) => {
                console.error("Proxy Error:", e);
                res.writeHead(500);
                res.end(JSON.stringify({
                    error: e.message
                }));
            });

            if (req.method === 'POST') {
                proxyReq.write(body);
            }
            proxyReq.end();
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(PORT, () => {
    console.log(`Local API Proxy running at http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/check-status`);
});