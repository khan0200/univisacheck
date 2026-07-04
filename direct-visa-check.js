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
    { keywords: ['접수'],             status: 'RECEIVED' },
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

function parseResult3_2(html) {
    // result3_2 is the e-Visa (gb03) result section
    // It contains one or more records, each as table blocks
    const results = [];

    // Extract all APPL_DTM values (application dates)
    const appl_dates = [...html.matchAll(/id="APPL_DTM"[^>]*>([^<]+)</g)].map(m => m[1].trim());
    
    // Extract PROC_STS_CDNM_1 elements - includes text + sometimes a date in parens like (2026.06.11.)
    const statusRaw  = [...html.matchAll(/id="PROC_STS_CDNM_1"[^>]*>([\s\S]*?)<\/div>/g)].map(m => stripTags(m[1]));
    
    const purposes   = [...html.matchAll(/id="ENTRY_PURPOSE"[^>]*>([^<]+)</g)].map(m => m[1].trim());
    
    // Extract rejection reasons (불허사유)
    const rejReasons = [...html.matchAll(/귀하의 비자신청에 대한 불허사유는 다음과 같습니다\s*:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));

    const count = Math.max(appl_dates.length, statusRaw.length);
    for (let i = 0; i < count; i++) {
        const statusKor = statusRaw[i] || '';
        
        // Extract date from status text like "사용완료 (2026.06.11.)"
        let entryDate = '';
        const entryDateMatch = statusKor.match(/(\d{4}\.\d{2}\.\d{2}\.?)/);
        if (entryDateMatch) entryDate = entryDateMatch[1].replace(/\.$/,'').replace(/\./g,'-');
        
        results.push({
            applicationDate: appl_dates[i] || '',
            status:          parseKoreanStatus(statusKor),
            statusKorean:    statusKor,
            entryDate:       entryDate,
            entryPurpose:    purposes[i] || '',
            rejectionReason: rejReasons[i] || '',
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
async function checkVisaDirect(passport, fullName, birthDate) {
    const cookies = await getSession();
    
    const body = querystring.stringify({
        pRADIOSEARCH: 'gb03',
        sBUSI_GB:     'PASS_NO',
        sBUSI_GBNO:   passport.toUpperCase().trim(),
        ssBUSI_GBNO:  passport.toUpperCase().trim(),
        sEK_NM:       fullName.toUpperCase().trim(),
        sFROMDATE:    birthDate,
        sMainPopUpGB: 'main',
    });
    
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
    
    // Parse result count from embedded JS
    const countMatch = r.body.match(/"(\d+)"\s*==\s*0/);
    const resultCount = countMatch ? parseInt(countMatch[1]) : 0;
    
    if (resultCount === 0) {
        return {
            found: false,
            records: [],
            latestStatus: 'Pending',
            latestDate: '',
            resultCount: 0,
        };
    }
    
    // Parse all records from the result3_2 section
    const records = parseResult3_2(r.body);
    
    // Latest record is first (most recent application)
    const latest = records[0] || {};
    
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
    };
}

// ─── TEST ───────────────────────────────────────────────────────────────────

const ALL_STUDENTS = [
    ['ABDUGANIEV MUKHAMMAD AZIZ UMIDJON UGLI', '2006-03-18', 'FB0369182'],
    ['SOLIEV MUKHAMMADYUSUF BOKHODIRJON UGLI',  '2006-09-22', 'FA9826301'],
    ['ESHNIYOZOV ASADBEK JURABEK UGLI',         '2007-03-09', 'FB1060501'],
    ['ABDURAKHIMOV MURODILLA ADKHAMJON UGL',    '2007-10-11', 'FB2307435'],
    ['ADKHAMOV ABRORBEK LAZIZBEK UGLI',         '2008-05-20', 'FB0847535'],
    ['ABSOATOV SUYAR KAHRAMON UGLI',            '2003-08-29', 'FA5936010'],
    ['ERGASHEV ABDURAHMON AKMALJON UGLI',       '2007-10-02', 'FB2111376'],
    ['PARDAEV OZODBEK ZULFIKOROVICH',           '2007-03-10', 'FB1438787'],
    ['PRIMOV JAVOHIR MUSURMON UGLI',            '2004-09-24', 'FA7282802'],
    ['KURAKBOEV JAMSHID IKHTIYOR UGLI',         '2006-09-13', 'FB0718962'],
    ['SALIMOV MUKHAMMADALI OZODBEK UGLI',       '2005-11-25', 'FA9657942'],
    ['TUKHTASINOV MIRZAKARIM NEMATALI UGLI',    '2007-11-26', 'FB1309628'],
    ['ABDURAKHIMOV KHUSANBOY ABDUSALOM UGLI',   '2006-12-12', 'FB2287181'],
    ['TOSHTEMIROVA OYSANAM NEMATILLO KIZI',     '2004-03-08', 'FB2042288'],
    ['JUMANAZAROV SHOHRUKHBEK MUROTALI UGLI',   '2006-06-12', 'FA9722395'],
    ['MAHMUDOV MANSURJON MARUFJON UGLI',        '2004-05-08', 'FA6509526'],
    ['SODIRJONOV SAMARIDDIN SARDORJON UGLI',    '2007-09-02', 'FB1587282'],
    ['ABDURAKHIMOV KHASANBOY ABDUSALOM UGLI',   '2006-12-12', 'FB2329202'],
    ['DARKHONOV ALISHER DILMUROD UGLI',         '2007-08-04', 'FB2226732'],
    ['ABDUKHALIMOV JAHONGIR FARUKH UGLI',       '2006-09-04', 'FA9157223'],
    ['MUHAMADISAEV KAMBARBEK HAYOTJON UGLI',    '2005-08-25', 'FB2126370'],
    ['TOJIBOEV MUKHAMMAD IBROKHIM DJAKHANGIR',  '2007-03-19', 'FB2260945'],
    ['KOSIMOV SHOKHRUKHBEK KOZIMJON UGLI',      '2004-08-07', 'FB1973530'],
    ['AVAZOV NODIRBEK JONPULAT UGLI',           '2007-10-23', 'FB1175780'],
];

async function runTest() {
    console.log('🇰🇷 Direct visa.go.kr Status Check (gb03 / e-Visa Individual mode)\n');
    console.log('=' .repeat(78));
    console.log(`${'PASSPORT'.padEnd(12)} ${'NAME'.padEnd(32)} ${'STATUS'.padEnd(16)} ${'DATE'.padEnd(12)} REASON`);
    console.log('-'.repeat(78));

    const summary = {};
    
    for (const [name, dob, passport] of ALL_STUDENTS) {
        try {
            const result = await checkVisaDirect(passport, name, dob);
            const s = result.latestStatus;
            summary[s] = (summary[s] || 0) + 1;
            
            const shortName = name.split(' ').slice(0, 2).join(' ');
            const reason = result.rejectionReason ? result.rejectionReason.substring(0, 20) : '';
            console.log(
                `${passport.padEnd(12)} ${shortName.padEnd(32)} ${s.padEnd(16)} ${(result.latestDate||'').padEnd(12)} ${reason}`
            );
        } catch (err) {
            summary['ERROR'] = (summary['ERROR'] || 0) + 1;
            console.log(`${passport.padEnd(12)} ${'ERROR'.padEnd(32)} ${err.message.substring(0, 40)}`);
        }
        
        // Polite delay
        await new Promise(r => setTimeout(r, 600));
    }
    
    console.log('='.repeat(78));
    console.log('📊 Summary:');
    for (const [s, n] of Object.entries(summary)) {
        console.log(`   ${s}: ${n}`);
    }
    console.log('');
}

runTest().catch(console.error);

module.exports = { checkVisaDirect, getSession };
