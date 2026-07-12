/**
 * Admin CLI tool to reset user passwords directly in the Turso database.
 * Usage:
 *   node reset-password.js <email> <new_password>
 */

const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// Credentials come from environment variables, or turso.config.js (gitignored)
// for local development — same pattern as api/db.js. Never hardcode secrets here.
let localConfig = {};
try {
    localConfig = require(path.join(__dirname, 'turso.config.js'));
} catch (_) {
    // Not present — expected in production, where env vars are used instead.
}

const dbUrl = process.env.TURSO_URL || localConfig.TURSO_DATABASE_URL;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN || localConfig.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbAuthToken) {
    console.error('❌ Missing Turso credentials. Set TURSO_URL and TURSO_AUTH_TOKEN env vars, or add turso.config.js locally.');
    process.exit(1);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('\n❌ Error: Missing parameters.');
        console.log('Usage:\n  node reset-password.js <email> <new_password>\n');
        process.exit(1);
    }

    const email = args[0].toLowerCase().trim();
    const newPassword = args[1];

    if (newPassword.length < 6) {
        console.error('❌ Error: Password must be at least 6 characters.');
        process.exit(1);
    }

    const client = createClient({
        url: dbUrl,
        authToken: dbAuthToken
    });

    try {
        // 1. Check if user exists
        const userCheck = await client.execute({
            sql: 'SELECT id, username FROM users WHERE email = ?',
            args: [email]
        });

        if (userCheck.rows.length === 0) {
            console.error(`❌ Error: User with email "${email}" not found.`);
            client.close();
            process.exit(1);
        }

        const user = userCheck.rows[0];

        // 2. Hash new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // 3. Update in database
        await client.execute({
            sql: 'UPDATE users SET password = ? WHERE id = ?',
            args: [hashedPassword, user.id]
        });

        console.log('\n✨ Password Reset Successful! ✨');
        console.log(`👤 Profile:  ${user.username} (${email})`);
        console.log(`🔑 Password: [Updated to your new password]\n`);

    } catch (err) {
        console.error('❌ Database error:', err.message);
    } finally {
        client.close();
    }
}

main();
