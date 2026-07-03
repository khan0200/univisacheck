// Shared JWT utilities for auth
const jwt = require('jsonwebtoken');
const path = require('path');

// JWT_SECRET comes from an environment variable in production (set it in
// Vercel). turso.config.js (gitignored) supplies it locally so dev works
// without exporting env vars. No secret is hardcoded in this tracked file —
// a committed JWT secret would let anyone forge a login token for any user.
let localConfig = {};
try {
    localConfig = require(path.join(__dirname, '..', 'turso.config.js'));
} catch (_) {
    // Not present — expected in production.
}

const JWT_SECRET = process.env.JWT_SECRET || localConfig.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error(
        'Missing JWT_SECRET. Set the JWT_SECRET environment variable (Vercel), ' +
        'or provide it in turso.config.js for local development.'
    );
}
const JWT_EXPIRES = '7d';

/**
 * Signs a new JWT token for a user.
 * @param {{ id: number, email: string, username: string }} user
 * @returns {string}
 */
function signToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

/**
 * Extracts and verifies JWT from `Authorization: Bearer <token>` header.
 * Returns the decoded payload or null if invalid/missing.
 * @param {object} req
 * @returns {{ userId: number, email: string, username: string } | null}
 */
function verifyToken(req) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:3000',
];

/**
 * Sets standard CORS headers on the response.
 */
function setCors(req, res) {
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { JWT_SECRET, signToken, verifyToken, setCors, ALLOWED_ORIGINS };
