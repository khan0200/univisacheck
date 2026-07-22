/**
 * direct-visa-check.js
 * 
 * ✅ WORKING: Directly query https://www.visa.go.kr/openPage.do?MENU_ID=10301
 * using the gb03 (e-Visa Individual - passport number search) mode.
 * 
 * This completely bypasses visamasters.uz.
 * 
 * HOW IT WORKS:
 * 1. GET /openPage.do?MENU_ID=10301 to obtain JSESSIONID cookie
 * 2. POST /openPage.do?MENU_ID=10301 with gb03 params (passport, name, DOB)
 * 3. Parse the HTML response - results are in the "result3_2" section
 * 
 * STATUS MAPPING (Korean → English):
 *   불허     → REJECTED
 *   허가     → APPROVED  
 *   접수     → RECEIVED
 *   심사중   → UNDER REVIEW
 *   발급     → ISSUED
 */

const https = require('https');
const querystring = require('querystring');

const HOST = 'www.visa.go.kr';
let sessionCookies = null;
let sessionFetchedAt = 0;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function httpReq(method, path, headers, body = null) {
    return new Promise((resolve, reject) => {
        const r = https.request({ hostname: HOST, port: 443, path, method, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
    });
}

async function getSession(force = false) {
    const now = Date.now();
    if (!force && sessionCookies && (now - sessionFetchedAt) < SESSION_TTL_MS) {
        return sessionCookies;
    }
    const r = await httpReq('GET', '/openPage.do?MENU_ID=10301', {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
    });
    sessionCookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    sessionFetchedAt = now;
    return sessionCookies;
}

function stripTags(s) {
    return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const KOREAN_STATUS_MAP = [
    { keywords: ['사용완료'],         status: 'VISA USED' },
    { keywords: ['불허'],             status: 'REJECTED' },
    { keywords: ['허가', '발급'],     status: 'APPROVED' },
    { keywords: ['접수', '신청'],     status: 'RECEIVED' },
    { keywords: ['심사중', '처리중'], status: 'UNDER REVIEW' },
    { keywords: ['취소'],             status: 'CANCELLED' },
    { keywords: ['반려'],             status: 'RETURNED' },
    { keywords: ['보완'],             status: 'PENDING SUPPLEMENT' },
    { keywords: ['기한만료'],         status: 'EXPIRED' },
];

function parseKoreanStatus(korean) {
    if (!korean) return 'UNKNOWN';
    for (const entry of KOREAN_STATUS_MAP) {
        if (entry.keywords.some(k => korean.includes(k))) return entry.status;
    }
    return korean; // Return original if no mapping found
}

function parseResult1_1(html) {
    // result1_1 is the E-Visa Search (gb01) result section
    const results = [];

    // Extract dates
    const appl_dates = [...html.matchAll(/id="APPL_YMD"[^>]*>([^<]+)</g)].map(m => m[1].trim());

    // Extract statuses with position
    const statusMatches = [...html.matchAll(/id="PROC_STS_CDNM"[^>]*>([\s\S]*?)<\/div>/g)];
    const statuses = statusMatches.map(m => ({
        text: stripTags(m[1]).trim(),
        index: m.index
    }));

    // Extract rejection reasons with position
    const rejMatches = [...html.matchAll(/귀하의 비자신청에 대한 불허사유는 다음과 같습니다\s*:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)];
    const rejReasons = rejMatches.map(m => ({
        text: stripTags(m[1]).trim(),
        index: m.index
    }));

    const statusCount = statuses.length;
    const mappedRejections = new Array(statusCount).fill('');

    for (const rej of rejReasons) {
        let bestStatusIdx = -1;
        for (let i = 0; i < statusCount; i++) {
            if (statuses[i].index < rej.index) {
                bestStatusIdx = i;
            }
        }
        if (bestStatusIdx !== -1) {
            mappedRejections[bestStatusIdx] = rej.text;
        }
    }

    const purposes = [...html.matchAll(/id="SOJ_QUAL_NM"[^>]*>([^<]+)</g)].map(m => m[1].trim());

    const count = Math.max(appl_dates.length, statusCount);
    for (let i = 0; i < count; i++) {
        const statusObj = statuses[i] || { text: '' };
        const statusKor = statusObj.text;

        let entryDate = '';
        const entryDateMatch = statusKor.match(/(\d{4}[\.\-]\d{2}[\.\-]\d{2})/);
        if (entryDateMatch) {
            entryDate = entryDateMatch[1].replace(/\.$/,'').replace(/\./g,'-');
        } else if (parseKoreanStatus(statusKor) === 'APPROVED') {
            const htmlDateMatch = html.match(/(?:ISSUE_YMD|PERMIT_YMD|VAL_START_YMD|PRINT_YMD|CERT_YMD)[\s\S]{0,100}?(\d{4}[\.\-]\d{2}[\.\-]\d{2})/i);
            if (htmlDateMatch) entryDate = htmlDateMatch[1].replace(/\./g,'-');
        }
        if (entryDate === (appl_dates[i] || '')) {
            entryDate = '';
        }

        results.push({
            applicationDate: appl_dates[i] || '',
            status:          parseKoreanStatus(statusKor),
            statusKorean:    statusKor,
            entryDate,
            entryPurpose:    purposes[i] || '',
            rejectionReason: mappedRejections[i] || '',
        });
    }

    return results;
}

function parseResult3_2(html) {
    // result3_2 is the Embassy/Diplomatic Mission (gb03) result section
    const results = [];

    // 1. Extract dates
    function extractDateField(fieldId) {
        const matches = [...html.matchAll(new RegExp(`id="${fieldId}"[^>]*>([\\s\\S]*?)<`, 'g'))];
        return matches.map(m => m[1].replace(/\s+/g, ' ').trim()).filter(v => v.length > 0);
    }

    function formatKoreanDate(raw) {
        if (/^\d{8}$/.test(raw)) {
            return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
        }
        return raw.replace(/\./g, '-').replace(/-$/, '');
    }

    let appl_dates = extractDateField('RECPT_YMD').map(formatKoreanDate);
    if (appl_dates.length === 0) {
        appl_dates = extractDateField('APPL_YMD').map(formatKoreanDate);
    }
    if (appl_dates.length === 0) {
        appl_dates = extractDateField('APPL_DTM').map(formatKoreanDate);
    }

    // 2. Extract statuses along with their positions in HTML
    const statusMatches = [...html.matchAll(/id="PROC_STS_CDNM_1"[^>]*>([\s\S]*?)<\/div>/g)];
    const statuses = statusMatches.map(m => ({
        text: stripTags(m[1]).trim(),
        index: m.index
    }));

    // 3. Extract rejection reasons along with their positions in HTML
    const rejMatches = [...html.matchAll(/귀하의 비자신청에 대한 불허사유는 다음과 같습니다\s*:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)];
    const rejReasons = rejMatches.map(m => ({
        text: stripTags(m[1]).trim(),
        index: m.index
    }));

    // 4. Map rejection reasons to their respective status based on HTML position
    const statusCount = statuses.length;
    const mappedRejections = new Array(statusCount).fill('');

    for (const rej of rejReasons) {
        let bestStatusIdx = -1;
        for (let i = 0; i < statusCount; i++) {
            if (statuses[i].index < rej.index) {
                bestStatusIdx = i;
            }
        }
        if (bestStatusIdx !== -1) {
            mappedRejections[bestStatusIdx] = rej.text;
        }
    }

    const purposes = [...html.matchAll(/id="ENTRY_PURPOSE"[^>]*>([^<]+)</g)].map(m => m[1].trim());

    const count = Math.max(appl_dates.length, statusCount);
    for (let i = 0; i < count; i++) {
        const statusObj = statuses[i] || { text: '' };
        const statusKor = statusObj.text;
        
        let entryDate = '';
        const entryDateMatch = statusKor.match(/(\d{4}[\.\-]\d{2}[\.\-]\d{2})/);
        if (entryDateMatch) {
            entryDate = entryDateMatch[1].replace(/\.$/,'').replace(/\./g,'-');
        } else if (parseKoreanStatus(statusKor) === 'APPROVED') {
            const htmlDateMatch = html.match(/(?:ISSUE_YMD|PERMIT_YMD|VAL_START_YMD|PRINT_YMD|CERT_YMD)[\s\S]{0,100}?(\d{4}[\.\-]\d{2}[\.\-]\d{2})/i);
            if (htmlDateMatch) entryDate = htmlDateMatch[1].replace(/\./g,'-');
        }
        if (entryDate === (appl_dates[i] || '')) {
            entryDate = '';
        }

        results.push({
            applicationDate: appl_dates[i] || '',
            status:          parseKoreanStatus(statusKor),
            statusKorean:    statusKor,
            entryDate,
            entryPurpose:    purposes[i] || '',
            rejectionReason: mappedRejections[i] || '',
        });
    }
    return results;
}

/**
 * Main function: check visa status directly from visa.go.kr
 * 
 * @param {string} passport - Passport number (e.g., "FB0369182")
 * @param {string} fullName - Full name in English (e.g., "ABDUGANIEV MUKHAMMAD AZIZ")
 * @param {string} birthDate - Date of birth in YYYY-MM-DD format (e.g., "2006-03-18")
 * @returns {Object} { found: boolean, records: Array, latestStatus: string, latestDate: string, ... }
 */
async function checkVisaDirect(passport, fullName, birthDate, visaType = 'Embassy', applicationNo = '') {
    const cookies = await getSession();
    const isEVisa = (visaType === 'E-Visa') && applicationNo;

    const bodyParams = isEVisa ? {
        pRADIOSEARCH:  'gb01', // E-Visa Individual
        sINVITEE_SEQ:  applicationNo.toUpperCase().trim(),
        ssINVITEE_SEQ: applicationNo.toUpperCase().trim(),
        sPASS_NO:      passport.toUpperCase().trim(),
        sEK_NM:        fullName.toUpperCase().trim(),
        sFROMDATE:     birthDate,
        sMainPopUpGB:  'main',
    } : {
        pRADIOSEARCH:  'gb03', // Diplomatic Mission
        sBUSI_GB:      'PASS_NO',
        sBUSI_GBNO:    passport.toUpperCase().trim(),
        ssBUSI_GBNO:   passport.toUpperCase().trim(),
        sEK_NM:        fullName.toUpperCase().trim(),
        sFROMDATE:     birthDate,
        sMainPopUpGB:  'main',
    };
    
    const body = querystring.stringify(bodyParams);
    
    let r;
    try {
        r = await httpReq('POST', '/openPage.do?MENU_ID=10301', {
            'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Referer':       'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
            'Origin':        'https://www.visa.go.kr',
            'Accept':        'text/html,application/xhtml+xml,*/*;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type':  'application/x-www-form-urlencoded',
            'Content-Length': String(Buffer.byteLength(body)),
            'Cookie':         cookies,
        }, body);
    } catch (err) {
        // On network error, try refreshing the session once
        const freshCookies = await getSession(true);
        r = await httpReq('POST', '/openPage.do?MENU_ID=10301', {
            'User-Agent':    'Mozilla/5.0 Chrome/124.0',
            'Referer':       'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
            'Origin':        'https://www.visa.go.kr',
            'Accept':        'text/html,*/*',
            'Content-Type':  'application/x-www-form-urlencoded',
            'Content-Length': String(Buffer.byteLength(body)),
            'Cookie':         freshCookies,
        }, body);
    }
    
    // ── Detect result count ───────────────────────────────────────────────────
    // visa.go.kr embeds JS like: if ("3" == 0) { /* no results block */ }
    // When countMatch is null the regex didn't match — DON'T assume 0.
    // Instead fall through to the parser and let it decide.
    const countMatch = r.body.match(/"(\d+)"\s*==\s*0/);
    let resultCount = countMatch ? parseInt(countMatch[1]) : null; // null = unknown

    // Secondary signal: presence of status elements in the HTML
    const hasStatusElements = isEVisa
        ? /id="PROC_STS_CDNM"/.test(r.body)
        : /id="PROC_STS_CDNM_1"/.test(r.body);

    // If count is definitively 0 AND no status elements present → truly not found
    if (resultCount === 0 && !hasStatusElements) {
        console.log(`[Direct] ${passport}: resultCount=0 and no status elements → not found`);
        return {
            found: false,
            records: [],
            latestStatus: 'Pending',
            latestDate: '',
            resultCount: 0,
        };
    }

    // Parse all records (always attempt — even if count regex returned null)
    const records = isEVisa ? parseResult1_1(r.body) : parseResult3_2(r.body);

    // If parsing also found nothing → not found
    if (records.length === 0) {
        console.log(`[Direct] ${passport}: parsing found 0 records → not found`);
        return {
            found: false,
            records: [],
            latestStatus: 'Pending',
            latestDate: '',
            resultCount: 0,
        };
    }

    if (resultCount === null) resultCount = records.length;

    
    // Latest record is first (most recent application)
    const latest = records[0] || {};

    // Extract dynamic variables for printing/downloading certificate PDF
    const evSeq = (r.body.match(/var\s+evSeq\s*=\s*"([^"]*)"/) || [])[1] || '';
    const invSeq = (r.body.match(/var\s+invSeq\s*=\s*"([^"]*)"/) || [])[1] || '';
    const applNo = (r.body.match(/var\s+applNo\s*=\s*"([^"]*)"/) || [])[1] || '';

    let pdfUrl = '';
    if (evSeq) {
        pdfUrl = `https://www.visa.go.kr/biz/ap/ev/selectElectronicVisaPrint3.do?evSeq=${evSeq}&invSeq=${invSeq}&applNo=${applNo}`;
    }
    
    // Extract extra visa info fields (TABLE 3 / E-Visa Table)
    let visaExpiry = '';
    const exprMatch = r.body.match(/id="VISA_EXPR_YMD"[^>]*>([\s\S]*?)<\/div>/i);
    if (exprMatch) {
        const rawExpr = stripTags(exprMatch[1]);
        const dateMatch = rawExpr.match(/(\d{4}\.\d{2}\.\d{2})/);
        if (dateMatch) {
            visaExpiry = dateMatch[1].replace(/\./g, '-');
        }
    }

    let visaKind = '';
    const kindMatch = r.body.match(/id="VISA_KIND_CD"[^>]*>([\s\S]*?)<\/div>/i);
    if (kindMatch) {
        const rawKind = stripTags(kindMatch[1]).toLowerCase();
        if (rawKind.includes('단수')) {
            visaKind = 'Single';
        } else if (rawKind.includes('복수')) {
            visaKind = 'Multiple';
        } else {
            visaKind = stripTags(kindMatch[1]);
        }
    }

    const statusOfResidenceMatches = [...r.body.matchAll(/id="SOJ_QUAL_NM"[^>]*>([^<]+)/gi)].map(m => m[1].trim());
    const statusOfResidence = statusOfResidenceMatches.length > 0 ? statusOfResidenceMatches[statusOfResidenceMatches.length - 1] : '';

    const inviterMatches = [...r.body.matchAll(/id="MEM_NM"[^>]*>([^<]+)/gi)].map(m => m[1].trim());
    const invitingCompany = inviterMatches.length > 0 ? inviterMatches[inviterMatches.length - 1] : '';

    return {
        found: true,
        records,
        resultCount,
        latestStatus:       latest.status || 'UNKNOWN',
        latestStatusKorean: latest.statusKorean || '',
        latestDate:         latest.applicationDate || '',
        entryDate:          latest.entryDate || '',
        entryPurpose:       latest.entryPurpose || '',
        rejectionReason:    latest.rejectionReason || '',
        visaExpiry,
        visaKind,
        statusOfResidence,
        invitingCompany,
        pdfUrl,
    };
}

module.exports = { checkVisaDirect, getSession };
