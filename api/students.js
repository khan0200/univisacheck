// Vercel Serverless Function — /api/students
// Handles CRUD operations for students in Turso database.
// All operations are scoped to the authenticated user via JWT.

const db = require('./db');
const { verifyToken, setCors } = require('./auth-helper');

module.exports = async (req, res) => {
    // CORS
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    try {
        const method = req.method;

        // ── Public: GET by passport (for student self-check page) ──────────────
        // GET /api/students?passport=XX1234567&public=true  → returns limited fields, no auth
        // Intentionally includes soft-deleted rows too, so re-adding a deleted
        // student (here or in the Add Student modal) can still autofill from
        // their last known name/birthday.
        // Falls back to bot_manual_refreshes if the passport was only ever
        // checked via the Telegram bot (not yet added to any cabinet).
        if (method === 'GET' && req.query.public === 'true') {
            const { passport } = req.query;
            if (!passport) {
                res.status(400).json({ error: 'Missing passport parameter' });
                return;
            }
            const passportKey = passport.toUpperCase().trim();
            const result = await db.execute({
                sql: 'SELECT passport, fullName, birthday, status, applicationDate, lastChecked, rejectReason, pdfUrl, visaType, applicationNo, apiResponse FROM students WHERE passport = ?',
                args: [passportKey]
            });

            // If found in students table, return immediately
            if (result.rows.length > 0) {
                res.status(200).json(result.rows);
                return;
            }

            // Fallback: check bot_manual_refreshes (any passport ever checked via Telegram bot)
            const botResult = await db.execute({
                sql: 'SELECT passport, fullname AS fullName, birthday, visa_type AS visaType, application_no AS applicationNo FROM bot_manual_refreshes WHERE passport = ?',
                args: [passportKey]
            });

            if (botResult.rows.length > 0) {
                // Normalise to the same shape the frontend expects
                const row = botResult.rows[0];
                res.status(200).json([{
                    passport:        row.passport,
                    fullName:        row.fullName || '',
                    birthday:        row.birthday || '',
                    visaType:        row.visaType || 'Embassy',
                    applicationNo:   row.applicationNo || '',
                    status:          null,
                    applicationDate: null,
                    lastChecked:     null,
                    rejectReason:    null,
                    pdfUrl:          null,
                    apiResponse:     null
                }]);
                return;
            }

            res.status(200).json([]);
            return;
        }


        // ── All other operations require authentication ─────────────────────────
        const authUser = verifyToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Unauthorized. Please log in.' });
            return;
        }
        const userId = authUser.userId;

        if (method === 'GET') {
            const { passport } = req.query;
            if (passport) {
                const result = await db.execute({
                    sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
                    args: [passport.toUpperCase().trim(), userId]
                });
                const mappedRows = result.rows.map(r => ({
                    ...r,
                    batchSelected: r.batchSelected === 1
                }));
                res.status(200).json(mappedRows);
            } else {
                const result = await db.execute({
                    sql: 'SELECT * FROM students WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC',
                    args: [userId]
                });
                const mappedRows = result.rows.map(r => ({
                    ...r,
                    batchSelected: r.batchSelected === 1
                }));
                res.status(200).json(mappedRows);
            }
            return;
        }

        if (method === 'DELETE') {
            const { passport } = req.query;
            if (!passport) {
                res.status(400).json({ error: 'Missing passport parameter' });
                return;
            }

            const passports = passport.split(',').map(p => p.toUpperCase().trim()).filter(Boolean);
            if (passports.length === 0) {
                res.status(400).json({ error: 'No valid passports provided' });
                return;
            }

            // Soft delete: mark deletedAt instead of removing the row, so the
            // student disappears from this user's dashboard but their data is
            // still there to autofill from if the same passport is re-added later.
            const placeholders = passports.map(() => '?').join(', ');
            const sql = `UPDATE students SET deletedAt = ? WHERE passport IN (${placeholders}) AND userId = ?`;
            const args = [new Date().toISOString(), ...passports, userId];
            await db.execute({ sql, args });

            res.status(200).json({ success: true });
            return;
        }

        if (method === 'POST' || method === 'PATCH') {
            const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
            const passport = (body.passport || '').toUpperCase().trim();
            // originalPassport is sent only when editing an existing student whose
            // passport number itself is being changed — it identifies which row to
            // update, while `passport` carries the new value to save into it.
            const originalPassport = (body.originalPassport || '').toUpperCase().trim();
            const isRename = originalPassport && originalPassport !== passport;

            if (!passport) {
                res.status(400).json({ error: 'Missing passport in request body' });
                return;
            }

            // `passport` is globally UNIQUE in the DB (not scoped per user) — even
            // a soft-deleted row still occupies its passport slot — so every check
            // against it must be global, or an INSERT/UPDATE below can throw a raw
            // SQLITE_CONSTRAINT instead of a clean error. A soft-deleted row can
            // only be revived by the same user who deleted it; otherwise a passport
            // held by someone else's row (active or soft-deleted) is a hard conflict.
            let hasConflict = false;
            if (isRename) {
                // Ensure the user owns the original student
                const ownsOriginal = await db.execute({
                    sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ?',
                    args: [originalPassport, userId]
                });
                if (ownsOriginal.rows.length === 0) {
                    res.status(404).json({ error: 'Student not found.' });
                    return;
                }

                // Check if the new passport already exists for this user (and is active)
                const collision = await db.execute({
                    sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
                    args: [passport, userId]
                });
                if (collision.rows.length > 0) {
                    hasConflict = true;
                }
            } else {
                // Only check duplicate conflicts if we are inserting a new student record
                const checkExistence = await db.execute({
                    sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ?',
                    args: [passport, userId]
                });
                if (checkExistence.rows.length === 0) {
                    const userMatch = await db.execute({
                        sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
                        args: [passport, userId]
                    });
                    if (userMatch.rows.length > 0) {
                        hasConflict = true;
                    }
                }
            }

            if (hasConflict) {
                res.status(409).json({ error: `Passport ${passport} is already registered under your account.` });
                return;
            }

            // Check if a row for THIS USER already exists — active OR soft-deleted
            // (decides INSERT vs UPDATE; reviving a soft-deleted row is an UPDATE
            // that also clears deletedAt below).
            const check = await db.execute({
                sql: 'SELECT passport, deletedAt FROM students WHERE passport = ? AND userId = ?',
                args: [isRename ? originalPassport : passport, userId]
            });
            const exists = check.rows.length > 0;
            const isRevive = exists && check.rows[0].deletedAt;

            const fullName = body.fullName !== undefined ? body.fullName.toUpperCase().trim() : null;
            const birthday = body.birthday !== undefined ? body.birthday.trim() : null;
            const studentId = body.studentId !== undefined ? body.studentId.trim() : null;
            const status = body.status !== undefined ? body.status : null;
            const applicationDate = body.applicationDate !== undefined ? body.applicationDate.trim() : null;
            const rejectReason = body.rejectReason !== undefined ? body.rejectReason : (body.rejectionReason !== undefined ? body.rejectionReason : null);
            const pdfUrl = body.pdfUrl !== undefined ? body.pdfUrl : null;
            const apiResponse = body.apiResponse !== undefined ? (typeof body.apiResponse === 'object' ? JSON.stringify(body.apiResponse) : body.apiResponse) : null;
            const visaType = body.visaType !== undefined ? body.visaType.trim() : null;
            const applicationNo = body.applicationNo !== undefined ? body.applicationNo.trim() : null;

            let batchSelected = null;
            if (body.batchSelected !== undefined) {
                batchSelected = body.batchSelected ? 1 : 0;
            }

            let lastChecked = null;
            if (body.lastChecked !== undefined) {
                lastChecked = new Date().toISOString();
            }

            let batchSelectedUpdatedAt = null;
            if (body.batchSelectedUpdatedAt !== undefined) {
                batchSelectedUpdatedAt = new Date().toISOString();
            }

            if (!exists) {
                // Insert new student with userId
                const sql = `
                    INSERT INTO students (
                        passport, fullName, birthday, studentId, status,
                        applicationDate, lastChecked, rejectReason, pdfUrl, apiResponse,
                        batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
                `;
                await db.execute({
                    sql,
                    args: [
                        passport,
                        fullName || '',
                        birthday || '',
                        studentId || '',
                        status || 'Pending',
                        applicationDate || '',
                        lastChecked || new Date().toISOString(),
                        rejectReason || '',
                        pdfUrl || '',
                        apiResponse || '',
                        batchSelected !== null ? batchSelected : 0,
                        batchSelectedUpdatedAt || '',
                        userId,
                        visaType || 'Embassy',
                        applicationNo || ''
                    ]
                });
                res.status(201).json({ success: true, message: 'Student created successfully' });
            } else {
                // Update existing student — only if it belongs to this user
                const updateFields = [];
                const args = [];

                if (isRename) { updateFields.push('passport = ?'); args.push(passport); }
                if (isRevive) { updateFields.push('deletedAt = NULL'); }
                if (fullName !== null) { updateFields.push('fullName = ?'); args.push(fullName); }
                if (birthday !== null) { updateFields.push('birthday = ?'); args.push(birthday); }
                if (studentId !== null) { updateFields.push('studentId = ?'); args.push(studentId); }
                if (status !== null) { updateFields.push('status = ?'); args.push(status); }
                if (applicationDate !== null) { updateFields.push('applicationDate = ?'); args.push(applicationDate); }
                if (lastChecked !== null) { updateFields.push('lastChecked = ?'); args.push(lastChecked); }
                if (rejectReason !== null) { updateFields.push('rejectReason = ?'); args.push(rejectReason); }
                if (pdfUrl !== null) { updateFields.push('pdfUrl = ?'); args.push(pdfUrl); }
                if (apiResponse !== null) { updateFields.push('apiResponse = ?'); args.push(apiResponse); }
                if (batchSelected !== null) { updateFields.push('batchSelected = ?'); args.push(batchSelected); }
                if (batchSelectedUpdatedAt !== null) { updateFields.push('batchSelectedUpdatedAt = ?'); args.push(batchSelectedUpdatedAt); }
                if (visaType !== null) { updateFields.push('visaType = ?'); args.push(visaType); }
                if (applicationNo !== null) { updateFields.push('applicationNo = ?'); args.push(applicationNo); }

                if (updateFields.length === 0) {
                    res.status(200).json({ success: true, message: 'No fields to update' });
                    return;
                }

                args.push(isRename ? originalPassport : passport, userId);
                const sql = `UPDATE students SET ${updateFields.join(', ')} WHERE passport = ? AND userId = ?`;
                await db.execute({ sql, args });
                res.status(200).json({ success: true, message: 'Student updated successfully' });
            }
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('[Students API] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
