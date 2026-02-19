const admin = require('firebase-admin');

const API_HOST = 'visadoctors.uz';
const API_BASE_URL = `https://${API_HOST}/api/uz/visas/v2/check-status/`;
const TECHNICAL_STATUSES = ['COMPLETED', 'SUCCESS', 'QUEUED', 'DONE', 'IN_PROGRESS', 'PENDING'];
const STATUS_MAP = {
    'TASDIQLANGAN': 'APPROVED',
    'ISHLATILGAN': 'APPROVED',
    'BEKOR QILINGAN': 'CANCELLED',
    'RAD ETILGAN': 'REJECTED',
    'KO\'RIB CHIQILMOQDA': 'UNDER REVIEW',
    'QABUL QILINGAN': 'APP/RECEIVED',
    'VIZA TAYYORLANISH BOSQICHIDA': 'UNDER REVIEW'
};

function initFirebaseAdmin() {
    if (admin.apps.length) {
        return admin.firestore();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
        })
    });

    return admin.firestore();
}

function escapeTelegramText(value) {
    return String(value || '').replace(/[<>&]/g, '');
}

function getStatusEmoji(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved')) return '🟢';
    if (normalized.includes('cancel') || normalized.includes('reject')) return '🔴';
    if (normalized.includes('received') || normalized.includes('app/')) return '🟠';
    if (normalized.includes('under review')) return '🔵';
    return '🔷';
}

function getMessageTone(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('approved')) return { header: '🟢 Visa Status Update', footer: '🎉 Congratulations!' };
    if (normalized.includes('cancel') || normalized.includes('reject')) return { header: '🔴 Visa Status Update', footer: '' };
    if (normalized.includes('received') || normalized.includes('app/')) return { header: '🟠 Visa Status Update', footer: '⏳ Your application is in process.' };
    if (normalized.includes('under review')) return { header: '🔵 Visa Status Update', footer: '🔎 Your application is under review.' };
    return { header: '🔷 Visa Status Update', footer: 'ℹ️ Status updated.' };
}

function extractVisaStatus(data) {
    let foundStatus = null;
    let applicationDate = '';

    const errorIndicators = [
        data.error,
        (data.response_data && data.response_data.error) || null,
        (data.response_data && data.response_data.message) || null,
        data.message
    ];

    for (const errorMsg of errorIndicators) {
        if (errorMsg && typeof errorMsg === 'string') {
            const lowerMsg = errorMsg.toLowerCase();
            if (
                lowerMsg.includes('not found') ||
                lowerMsg.includes('no data') ||
                lowerMsg.includes('topilmadi') ||
                lowerMsg.includes('mavjud emas') ||
                lowerMsg.includes('no application') ||
                lowerMsg.includes('no record')
            ) {
                return { status: 'Pending', applicationDate: '' };
            }
        }
    }

    if (
        data.response_data === null ||
        (data.response_data && Object.keys(data.response_data).length === 0) ||
        (data.response_data && data.response_data.visa_data === null)
    ) {
        return { status: 'Pending', applicationDate: '' };
    }

    if (data.response_data && data.response_data.visa_data) {
        foundStatus = data.response_data.visa_data.status;
        applicationDate = data.response_data.visa_data.application_date || '';
    } else if (data.visa_data && data.visa_data.status) {
        foundStatus = data.visa_data.status;
        applicationDate = data.visa_data.application_date || '';
    } else if (data.response_data && data.response_data.visa_status) {
        foundStatus = data.response_data.visa_status;
    } else if (data.response_data && data.response_data.status) {
        const status = data.response_data.status;
        if (!TECHNICAL_STATUSES.includes(String(status).toUpperCase())) {
            foundStatus = status;
        }
    } else if (data.status) {
        const status = data.status;
        const upperStatus = String(status).toUpperCase();
        if (
            !TECHNICAL_STATUSES.includes(upperStatus) &&
            upperStatus !== 'ERROR' &&
            upperStatus !== 'FAILED' &&
            upperStatus !== 'FAILURE'
        ) {
            foundStatus = status;
        }
    }

    if (!foundStatus) {
        return { status: 'Unknown', applicationDate: '' };
    }

    const normalizedStatus = String(foundStatus).toUpperCase();
    for (const [uzbek, english] of Object.entries(STATUS_MAP)) {
        if (normalizedStatus.includes(uzbek.toUpperCase())) {
            return { status: english, applicationDate };
        }
    }

    return { status: foundStatus, applicationDate };
}

async function callVisaApi(student) {
    const payload = {
        passport_number: student.passport,
        english_name: student.fullName || '',
        birth_date: student.birthday || '',
        website: '',
        _form_start_time: Date.now() / 1000
    };

    const initialResponse = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': `https://${API_HOST}`,
            'Referer': `https://${API_HOST}/visa-status`,
            'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify(payload)
    });

    if (!initialResponse.ok) {
        throw new Error(`Initial visa API failed with ${initialResponse.status}`);
    }

    let data = await initialResponse.json();
    const taskId = data.id;
    let retry = 0;
    const maxRetries = 10;

    while (data.status === 'PENDING' && retry < maxRetries && taskId) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        retry += 1;

        const pollResponse = await fetch(`${API_BASE_URL}${taskId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': `https://${API_HOST}`,
                'Referer': `https://${API_HOST}/visa-status`,
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (pollResponse.ok) {
            data = await pollResponse.json();
        }
    }

    return data;
}

async function sendTelegramNotification(student, newStatus, applicationDate) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        return;
    }

    const fullName = escapeTelegramText(student.fullName);
    const studentId = escapeTelegramText(student.studentId);
    const statusValue = escapeTelegramText(newStatus);
    const applicationDateValue = escapeTelegramText(applicationDate);
    const statusEmoji = getStatusEmoji(statusValue);
    const messageTone = getMessageTone(statusValue);

    const text = [
        messageTone.header,
        '',
        `👤 Name: ${fullName}`,
        studentId ? `🎓 Student ID: ${studentId}` : '🎓 Student ID: --',
        applicationDateValue ? `📅 Application Date: ${applicationDateValue}` : '📅 Application Date: --',
        '',
        `🔄 Visa status: ${statusEmoji} ${statusValue}`,
        messageTone.footer
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true
        })
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (process.env.CRON_SECRET) {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
    }

    try {
        const db = initFirebaseAdmin();
        const collectionName = process.env.FIRESTORE_COLLECTION || 'unibridge';
        const snapshot = await db.collection(collectionName).where('autoCheck', '==', true).get();

        let checked = 0;
        let changed = 0;

        for (const studentDoc of snapshot.docs) {
            const student = studentDoc.data();
            if (!student.passport) {
                continue;
            }

            checked += 1;
            try {
                const apiData = await callVisaApi(student);
                const { status: newStatus, applicationDate } = extractVisaStatus(apiData);
                const oldStatus = student.status || 'Unknown';
                const isChanged = oldStatus.toLowerCase() !== String(newStatus).toLowerCase();

                const updatePayload = {
                    status: newStatus,
                    lastChecked: admin.firestore.FieldValue.serverTimestamp(),
                    apiResponse: apiData
                };

                if (applicationDate) {
                    updatePayload.applicationDate = applicationDate;
                }

                await studentDoc.ref.update(updatePayload);

                if (isChanged && oldStatus.toLowerCase() !== 'unknown') {
                    changed += 1;
                    await sendTelegramNotification(student, newStatus, applicationDate);
                }
            } catch (studentError) {
                console.error(`[CRON] Failed for ${student.passport}:`, studentError.message);
            }
        }

        res.status(200).json({
            ok: true,
            checked,
            changed
        });
    } catch (error) {
        console.error('[CRON] Error:', error);
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
};
