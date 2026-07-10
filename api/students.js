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
        if (method === 'GET' && req.query.public === 'true') {
            const { passport } = req.query;
            if (!passport) {
                res.status(400).json({ error: 'Missing passport parameter' });
                return;
            }
            const result = await db.execute({
                sql: 'SELECT passport, fullName, birthday, status, lastChecked, rejectReason, pdfUrl, visaType, applicationNo, apiResponse FROM students WHERE passport = ?',
                args: [passport.toUpperCase().trim()]
            });
            res.status(200).json(result.rows);
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
                    sql: 'SELECT * FROM students WHERE passport = ? AND userId = ?',
                    args: [passport.toUpperCase().trim(), userId]
                });
                const mappedRows = result.rows.map(r => ({
                    ...r,
                    batchSelected: r.batchSelected === 1
                }));
                res.status(200).json(mappedRows);
            } else {
                const result = await db.execute({
                    sql: 'SELECT * FROM students WHERE userId = ? ORDER BY createdAt DESC',
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

            // Build IN (?, ?, ...) query dynamically
            const placeholders = passports.map(() => '?').join(', ');
            const sql = `DELETE FROM students WHERE passport IN (${placeholders}) AND userId = ?`;
            const args = [...passports, userId];
            await db.execute({ sql, args });

            res.status(200).json({ success: true });
            return;
        }

        if (method === 'POST' || method === 'PATCH') {
            const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
            const passport = (body.passport || '').toUpperCase().trim();

            if (!passport) {
                res.status(400).json({ error: 'Missing passport in request body' });
                return;
            }

            // Check if student already exists FOR THIS USER
            const check = await db.execute({
                sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ?',
                args: [passport, userId]
            });
            const exists = check.rows.length > 0;

            const fullName = body.fullName !== undefined ? body.fullName.toUpperCase().trim() : null;
            const birthday = body.birthday !== undefined ? body.birthday.trim() : null;
            const studentId = body.studentId !== undefined ? body.studentId.trim() : null;
            const status = body.status !== undefined ? body.status : null;
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
                        lastChecked, rejectReason, pdfUrl, apiResponse,
                        batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
                `;
                await db.execute({
                    sql,
                    args: [
                        passport,
                        fullName || '',
                        birthday || '',
                        studentId || '',
                        status || 'Pending',
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

                if (fullName !== null) { updateFields.push('fullName = ?'); args.push(fullName); }
                if (birthday !== null) { updateFields.push('birthday = ?'); args.push(birthday); }
                if (studentId !== null) { updateFields.push('studentId = ?'); args.push(studentId); }
                if (status !== null) { updateFields.push('status = ?'); args.push(status); }
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

                args.push(passport, userId);
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
