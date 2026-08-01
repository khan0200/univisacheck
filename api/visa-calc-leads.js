// Vercel Serverless Function — /api/visa-calc-leads
// Admin-only: lists and updates leads captured by the AI Visa Calculator
// (name/phone/university/parent-income info students shared in chat).
// Gated by ADMIN_SECRET (same credential the AI chat's /login admin
// commands use) since this page surfaces PII across all students, not
// just the caller's own data -- there is no per-user ownership here.

const db = require('./db');
const path = require('path');

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
];

function setCors(req, res) {
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getAdminSecret() {
    let secret = process.env.ADMIN_SECRET || '';
    try {
        const tursoConfig = require(path.join(__dirname, '..', 'turso.config.js'));
        if (tursoConfig.ADMIN_SECRET) secret = tursoConfig.ADMIN_SECRET;
    } catch (_) {}
    return secret;
}

function isAuthorized(req) {
    const adminSecret = getAdminSecret();
    // Deliberately no insecure fallback default here (unlike the chat's
    // /login flow) -- this endpoint lists PII for every lead, so an unset
    // ADMIN_SECRET should hard-fail closed, not fall back to a guessable
    // shared default.
    if (!adminSecret) return false;
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    return token === adminSecret;
}

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (!isAuthorized(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        if (req.method === 'GET') {
            const result = await db.execute(
                `SELECT id, phone, full_name, age, university_name, university_type, parent_income_info,
                        language_certificate, planned_language_certificate,
                        father_official_income, father_monthly_salary, father_house, father_vehicle,
                        mother_official_income, mother_monthly_salary, mother_house, mother_vehicle,
                        business_info, self_employed_status, grandparents_pension,
                        temp_bank_deposit_availability, sponsor_availability, parent_deceased_status,
                        estimated_visa_approval_percentage, ai_generated_comment,
                        status, created_at, updated_at
                 FROM visa_calc_leads ORDER BY created_at DESC`
            );
            res.status(200).json(result.rows);
            return;
        }

        if (req.method === 'PATCH') {
            const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
            const { id, status, fields } = body;
            const allowedStatuses = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CONTACTED', 'ENROLLED', 'CANCELLED'];

            if (!id) {
                res.status(400).json({ error: 'Missing id' });
                return;
            }
            if (status !== undefined && !allowedStatuses.includes(status)) {
                res.status(400).json({ error: 'Invalid status' });
                return;
            }

            // `fields` covers the manually-editable lead data (admin corrections
            // from the dashboard); `status` is kept separate since it's also
            // driven automatically by the AI lead-capture pipeline.
            const EDITABLE_FIELDS = [
                'full_name', 'phone', 'age', 'university_name', 'university_type', 'parent_income_info',
                'language_certificate', 'planned_language_certificate',
                'father_official_income', 'father_monthly_salary', 'father_house', 'father_vehicle',
                'mother_official_income', 'mother_monthly_salary', 'mother_house', 'mother_vehicle',
                'business_info', 'self_employed_status', 'grandparents_pension',
                'temp_bank_deposit_availability', 'sponsor_availability', 'parent_deceased_status',
                'estimated_visa_approval_percentage', 'ai_generated_comment'
            ];

            const setParts = [];
            const args = [];
            if (fields && typeof fields === 'object') {
                for (const key of EDITABLE_FIELDS) {
                    if (Object.prototype.hasOwnProperty.call(fields, key)) {
                        setParts.push(`${key} = ?`);
                        args.push(fields[key] === '' ? null : fields[key]);
                    }
                }
            }
            if (status !== undefined) {
                setParts.push('status = ?');
                args.push(status);
            }

            if (setParts.length === 0) {
                res.status(400).json({ error: 'Nothing to update' });
                return;
            }

            args.push(id);
            await db.execute({
                sql: `UPDATE visa_calc_leads SET ${setParts.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
                args
            });
            res.status(200).json({ success: true });
            return;
        }

        if (req.method === 'DELETE') {
            const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
            const id = (req.query && req.query.id) || body.id;

            if (!id) {
                res.status(400).json({ error: 'Missing id' });
                return;
            }

            await db.execute({ sql: `DELETE FROM visa_calc_leads WHERE id = ?`, args: [id] });
            res.status(200).json({ success: true });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[Visa Calc Leads API] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
