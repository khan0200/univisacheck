const fs = require('fs');
const path = require('path');

// Adds the 17 new 1%-list placeholder universities (added earlier to
// universities-db.json via fix-1-percent-list.js) into index.html's
// TOP_UNIS_DATA array too. TOP_UNIS_DATA is the real source of truth --
// sync-db.js overwrites universities-db.json FROM it -- so without this,
// the next sync-db.js run would silently wipe these 17 entries back out.

const htmlPath = path.join(__dirname, '..', 'index.html');
const jsonPath = path.join(__dirname, '..', 'universities-db.json');

const html = fs.readFileSync(htmlPath, 'utf8');
const jsonDb = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const NEW_KEYS = [
    'POHANG UNIVERSITY OF SCIENCE AND TECHNOLOGY',
    'ULSAN NATIONAL INSTITUTE OF SCIENCE AND TECHNOLOGY',
    'DONGGUK UNIVERSITY (SEOUL)',
    "DUKSUNG WOMEN'S UNIVERSITY",
    'KONYANG UNIVERSITY',
    'SEOKYEONG UNIVERSITY',
    'SEOUL THEOLOGICAL UNIVERSITY',
    "SEOUL WOMEN'S UNIVERSITY",
    'SUNGKYUL UNIVERSITY',
    'SUNMOON UNIVERSITY',
    'PUSAN NATIONAL UNIVERSITY',
    'DANKOOK UNIVERSITY',
    'HONGIK UNIVERSITY',
    "SOOKMYUNG WOMEN'S UNIVERSITY",
    'JEJU NATIONAL UNIVERSITY',
    'KYUNGBOK UNIVERSITY',
    'ULSAN COLLEGE'
];

function jsField(key, value) {
    if (Array.isArray(value)) {
        if (value.length === 0) return `${key}: []`;
        // scholarships array of {cert, percent}
        if (typeof value[0] === 'object') {
            const items = value.map(v => `{ cert: ${JSON.stringify(v.cert)}, percent: ${JSON.stringify(v.percent)} }`).join(', ');
            return `${key}: [${items}]`;
        }
        return `${key}: [${value.map(v => JSON.stringify(v)).join(', ')}]`;
    }
    return `${key}: ${JSON.stringify(value || '')}`;
}

const FIELD_ORDER = [
    'name', 'koreanName', 'location', 'address', 'img', 'qsRank', 'founded', 'programs',
    'badge1', 'badge2', 'badge1Class', 'brandColor', 'statusTag', 'is1Percent',
    'tuition', 'appFee', 'language', 'visaStatus', 'visaDetails', 'kdb1DayAfterAdmission',
    'description', 'englishTrackMajors', 'koreanTrackMajors', 'scholarships', 'otherGrantsNote', 'majors'
];

const objects = NEW_KEYS.map(key => {
    const uni = jsonDb[key];
    const lines = FIELD_ORDER
        .filter(f => uni[f] !== undefined)
        .map(f => `            ${jsField(f, uni[f])}`);
    return `{\r\n${lines.join(',\r\n')}\r\n        }`;
});

const startIndex = html.indexOf('let TOP_UNIS_DATA = [');
if (startIndex === -1) throw new Error('TOP_UNIS_DATA not found');
const endIndex = html.indexOf('];', startIndex);
if (endIndex === -1) throw new Error('End of TOP_UNIS_DATA not found');

const before = html.slice(0, endIndex);
const after = html.slice(endIndex);

const insertion = ',\r\n' + objects.join(',\r\n') + '\r\n    ';
const newHtml = before.replace(/\s+$/, '') + insertion + after;

fs.writeFileSync(htmlPath, newHtml, 'utf8');
console.log(`Inserted ${objects.length} placeholder universities into index.html TOP_UNIS_DATA.`);
