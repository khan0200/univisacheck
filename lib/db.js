const { createClient } = require('@libsql/client');
const path = require('path');

let config;
try {
    config = require('../turso.config.js');
} catch (e) {
    config = { TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' };
}

const db = createClient({
    url: config.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
});

module.exports = db;
