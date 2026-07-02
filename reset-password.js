/**
 * Admin CLI tool to reset user passwords directly in the Turso database.
 * Usage:
 *   node reset-password.js <email> <new_password>
 */

const { createClient } = require('./node_modules/@libsql/client');
const bcrypt = require('./node_modules/bcryptjs');

const dbUrl = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const dbAuthToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

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
