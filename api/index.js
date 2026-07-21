// Vercel Serverless Function — /api/check-status
// Proxies visa status checks directly to visa.go.kr.
// Returns JSON: { status, detail, applicationDate, rejectionReason, pdfUrl }

const { checkVisaDirect } = require('../direct-visa-check');
const db = require('./db');

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
];

module.exports = async (req, res) => {
    // CORS
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const passport  = (body.passport_number || body.passport || '').toUpperCase().trim();
        const fullName  = (body.english_name    || body.full_name || '').toUpperCase().trim();
        const birthDate = (body.birth_date       || body.date_of_birth || '').trim();
        const visaType  = (body.visa_type || body.visaType || 'Embassy').trim();
        const applicationNo = (body.application_no || body.applicationNo || '').trim();

        if (!passport || !fullName || !birthDate) {
            res.status(400).json({ error: 'Missing required fields: passport, english_name, birth_date' });
            return;
        }

        console.log(`[Vercel Direct] Checking visa.go.kr for passport: ${passport}, type: ${visaType}, appNo: ${applicationNo}`);
        const direct = await checkVisaDirect(passport, fullName, birthDate, visaType, applicationNo);

        let previousRejectionReason = '';
        if (direct.records && direct.records.length > 1) {
            const prev = direct.records[1];
            if (prev && prev.rejectionReason) {
                previousRejectionReason = prev.rejectionReason;
            }
        }

        // Map to the same shape the frontend already expects
        const parsed = {
            status:          direct.latestStatus,
            detail:          direct.latestStatusKorean || direct.latestStatus,
            applicationDate: direct.latestDate || '',
            rejectionReason: direct.rejectionReason || '',
            pdfUrl:          direct.pdfUrl || '',
            rawHtml:         '',
            previousRejectionReason,
            // Extra fields for future use
            entryDate:       direct.entryDate || '',
            entryPurpose:    direct.entryPurpose || '',
            visaExpiry:      direct.visaExpiry || '',
            visaKind:        direct.visaKind || '',
            statusOfResidence: direct.statusOfResidence || '',
            invitingCompany:  direct.invitingCompany || '',
            resultCount:     direct.resultCount || 0,
            source:          'visa.go.kr',
        };

        // Only update the DB row when we can verify which user owns this student.
        // The cabinet frontend always sends a JWT; bot flows handle their own
        // DB updates via lib/cabinet.ts:refreshStudent(), so we skip them here.
        const { verifyToken } = require('./auth-helper');
        const authUser = verifyToken(req);
        try {
            const lastChecked = new Date().toISOString();
            const sql = (authUser && authUser.userId)
                ? `UPDATE students 
                   SET status = ?, 
                       applicationDate = ?, 
                       rejectReason = ?, 
                       pdfUrl = ?, 
                       apiResponse = ?, 
                       lastChecked = ?
                   WHERE passport = ? AND userId = ?`
                : `UPDATE students 
                   SET status = ?, 
                       applicationDate = ?, 
                       rejectReason = ?, 
                       pdfUrl = ?, 
                       apiResponse = ?, 
                       lastChecked = ?
                   WHERE passport = ?`;
            const args = [
                parsed.status || 'Pending',
                parsed.applicationDate || '',
                parsed.rejectionReason || '',
                parsed.pdfUrl || '',
                JSON.stringify({
                    status: parsed.status,
                    detail: parsed.detail,
                    visaExpiry: parsed.visaExpiry || '',
                    visaKind: parsed.visaKind || '',
                    statusOfResidence: parsed.statusOfResidence || '',
                    entryDate: parsed.entryDate || '',
                    entryPurpose: parsed.entryPurpose || '',
                    invitingCompany: parsed.invitingCompany || ''
                }),
                lastChecked,
                passport
            ];
            if (authUser && authUser.userId) {
                args.push(authUser.userId);
            }
            await db.execute({ sql, args });
        } catch (dbErr) {
            console.error('[Vercel DB Update] Error updating student visa status:', dbErr.message);
        }

        res.status(200).json(parsed);

    } catch (err) {
        console.error('[Vercel Direct] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
