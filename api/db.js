const { createClient } = require('@libsql/client');
const path = require('path');

// Credentials come from environment variables (set these in Vercel):
//   TURSO_URL, TURSO_AUTH_TOKEN
// For local development, turso.config.js (gitignored) supplies them so you
// don't have to export env vars — it is NEVER committed and NEVER used in
// production. No secret is hardcoded in this tracked file.
let localConfig = {};
try {
    localConfig = require(path.join(__dirname, '..', 'turso.config.js'));
} catch (_) {
    // Not present — expected in production, where env vars are used instead.
}

const url = process.env.TURSO_URL || localConfig.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || localConfig.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
    throw new Error(
        'Missing Turso credentials. Set TURSO_URL and TURSO_AUTH_TOKEN environment ' +
        'variables (Vercel), or provide them in turso.config.js for local development.'
    );
}

const client = createClient({ url, authToken });

module.exports = client;
