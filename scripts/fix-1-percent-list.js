const fs = require('fs');
const path = require('path');

// Fixes the "1% Universitetlar" list against the official 35-university +
// 3-college list the admin provided (screenshot). Two problems found:
// 1. FALSE POSITIVES in the existing DB: "Namseoul University" and
//    "Chungbuk National University" are flagged is1Percent=true but do NOT
//    appear in the official list.
// 2. MISSING ENTIRELY: 15 universities + 2 colleges from the official list
//    don't exist in universities-db.json at all (not just unflagged).
//
// This script edits universities-db.json (the source of truth that
// scripts/migrate-universities.js mirrors into Turso) rather than patching
// Turso directly, so the fix survives the next full migration run.
//
// IMPORTANT: for the newly-added entries we only know name / Korean name /
// location / QS rank from the official list screenshot. Tuition, app fee,
// language requirement, majors and scholarships are NOT fabricated here —
// they're left as explicit placeholders so the AI honestly says "to'liq
// ma'lumot hali kiritilmagan" instead of inventing numbers.

const dataPath = path.join(__dirname, '..', 'universities-db.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// 1. Unflag false positives
const falsePositives = ['CHUNGBUK NATIONAL UNIVERSITY', 'NAMSEOUL UNIVERSITY'];
for (const key of falsePositives) {
    if (data[key]) {
        data[key].is1Percent = false;
        console.log(`Unflagged: ${key}`);
    } else {
        console.log(`WARNING: ${key} not found in JSON, nothing to unflag.`);
    }
}

const PLACEHOLDER_NOTE = "To'liq ma'lumot (kontrakt narxi, til talabi, yo'nalishlar, stipendiyalar) hali bazaga kiritilmagan. Aniq va so'nggi ma'lumot uchun universitetning rasmiy saytiga yoki ishonchli agentlikka murojaat qiling.";

function minimalEntry({ name, koreanName, location, qsRank, isCollege }) {
    return {
        name,
        koreanName: koreanName || '',
        location: location || '',
        address: '',
        img: '',
        qsRank: qsRank || (isCollege ? "1% Lik Kollej" : "1% Akkred."),
        founded: '',
        programs: '',
        badge1: isCollege ? "1% Lik Kollej" : "1% Akkreditatsiya",
        badge2: isCollege ? "College" : "University",
        badge1Class: 'badge-gold',
        brandColor: '#0f2e5a',
        statusTag: "🥇 1% Akkreditatsiyadan o'tgan",
        is1Percent: true,
        tuition: '',
        appFee: '',
        language: '',
        visaStatus: 'Yengillashtirilgan (1%)',
        visaDetails: "1% yengillashtirilgan viza tartibi. Elchixonaga ota-ona daromad manbai ma'lumotnomasi talab etilmaydi (aniq KDB summasi hali tasdiqlanmagan).",
        kdb1DayAfterAdmission: '',
        description: PLACEHOLDER_NOTE,
        englishTrackMajors: [],
        koreanTrackMajors: [],
        scholarships: [],
        otherGrantsNote: PLACEHOLDER_NOTE,
        majors: []
    };
}

const newUniversities = [
    { key: 'POHANG UNIVERSITY OF SCIENCE AND TECHNOLOGY', name: 'Pohang University of Science and Technology (POSTECH)', koreanName: '포항공과대학교', location: 'POHANG', qsRank: 'QS #98' },
    { key: 'ULSAN NATIONAL INSTITUTE OF SCIENCE AND TECHNOLOGY', name: 'Ulsan National Institute of Science and Technology (UNIST)', koreanName: '울산과학기술원', location: 'ULSAN', qsRank: 'QS #280' },
    { key: 'DONGGUK UNIVERSITY (SEOUL)', name: 'Dongguk University (Seoul)', koreanName: '동국대학교', location: 'SEOUL', qsRank: 'QS #498' },
    { key: "DUKSUNG WOMEN'S UNIVERSITY", name: "Duksung Women's University", koreanName: '덕성여자대학교', location: 'SEOUL', qsRank: '' },
    { key: 'KONYANG UNIVERSITY', name: 'Konyang University', koreanName: '건양대학교', location: 'DAEJEON', qsRank: '' },
    { key: 'SEOKYEONG UNIVERSITY', name: 'Seokyeong University', koreanName: '서경대학교', location: 'SEOUL', qsRank: '' },
    { key: 'SEOUL THEOLOGICAL UNIVERSITY', name: 'Seoul Theological University', koreanName: '서울신학대학교', location: 'BUCHEON', qsRank: '' },
    { key: "SEOUL WOMEN'S UNIVERSITY", name: "Seoul Women's University", koreanName: '서울여자대학교', location: 'SEOUL', qsRank: '' },
    { key: 'SUNGKYUL UNIVERSITY', name: 'Sungkyul University', koreanName: '성결대학교', location: 'ANYANG', qsRank: '' },
    { key: 'SUNMOON UNIVERSITY', name: 'Sunmoon University', koreanName: '선문대학교', location: 'ASAN', qsRank: '' },
    { key: 'PUSAN NATIONAL UNIVERSITY', name: 'Pusan National University', koreanName: '부산대학교', location: 'BUSAN', qsRank: 'QS #501-510' },
    { key: 'DANKOOK UNIVERSITY', name: 'Dankook University', koreanName: '단국대학교', location: 'YONGIN/CHEONAN', qsRank: 'QS #1001-1200' },
    { key: 'HONGIK UNIVERSITY', name: 'Hongik University', koreanName: '홍익대학교', location: 'SEOUL', qsRank: 'QS #1001-1200' },
    { key: "SOOKMYUNG WOMEN'S UNIVERSITY", name: "Sookmyung Women's University", koreanName: '숙명여자대학교', location: 'SEOUL', qsRank: 'QS #1001-1200' },
    { key: 'JEJU NATIONAL UNIVERSITY', name: 'Jeju National University', koreanName: '제주대학교', location: 'JEJU', qsRank: 'QS #1201-1400' }
];

const newColleges = [
    { key: 'KYUNGBOK UNIVERSITY', name: 'Kyungbok University', koreanName: '경복대학교', location: 'NAMYANGJU', isCollege: true },
    { key: 'ULSAN COLLEGE', name: 'Ulsan College', koreanName: '울산과학대학교', location: 'ULSAN', isCollege: true }
];

let added = 0;
for (const u of [...newUniversities, ...newColleges]) {
    if (data[u.key]) {
        console.log(`Already exists, skipping: ${u.key}`);
        continue;
    }
    data[u.key] = minimalEntry(u);
    console.log(`Added placeholder: ${u.key}`);
    added++;
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`\nDone. ${added} new entries added, ${falsePositives.length} false positives unflagged.`);
console.log('Now run: node scripts/migrate-universities.js');
