const db = require('../lib/db');

const onePercentUnis = [
    { name: 'SUNGKYUNKWAN UNIVERSITY (SKKU)', qs_rank: 'QS #102' },
    { name: 'KOREA UNIVERSITY', qs_rank: 'QS #67' },
    { name: 'HANYANG UNIVERSITY', qs_rank: 'QS #162' },
    { name: 'KYUNG HEE UNIVERSITY', qs_rank: 'QS #328' },
    { name: 'SEJONG UNIVERSITY', qs_rank: 'QS #396' },
    { name: 'AJOU UNIVERSITY', qs_rank: 'QS #631-640' },
    { name: 'CHUNG-ANG UNIVERSITY', qs_rank: 'QS #494' },
    { name: 'EWHA WOMANS UNIVERSITY', qs_rank: 'QS #511' },
    { name: 'KYUNGPOOK NATIONAL UNIVERSITY', qs_rank: 'QS #516' },
    { name: 'INHA UNIVERSITY', qs_rank: 'QS #651-660' },
    { name: 'CHUNGNAM NATIONAL UNIVERSITY (CNU)', qs_rank: 'QS #751-760' },
    { name: 'KONKUK UNIVERSITY', qs_rank: 'QS #501-510' },
    { name: 'UNIVERSITY OF SEOUL', qs_rank: 'QS #751-760' },
    { name: 'KOREA AEROSPACE UNIVERSITY', qs_rank: 'Aero #1' },
    { name: 'KEIMYUNG UNIVERSITY', qs_rank: '' },
    { name: 'BUSAN UNIVERSITY OF FOREIGN STUDIES', qs_rank: '' },
    { name: "SUNGSHIN WOMEN'S UNIVERSITY", qs_rank: 'QS #1001-1200' },
    { name: 'KYUNGSUNG UNIVERSITY', qs_rank: '' },
    { name: 'HANSUNG UNIVERSITY', qs_rank: '' },
    { name: 'JOONGBU UNIVERSITY', qs_rank: '' },
    { name: 'POHANG UNIVERSITY OF SCIENCE AND TECHNOLOGY (POSTECH)', qs_rank: 'QS #98' },
    { name: 'ULSAN NATIONAL INSTITUTE OF SCIENCE AND TECHNOLOGY (UNIST)', qs_rank: 'QS #280' },
    { name: 'DONGGUK UNIVERSITY (SEOUL)', qs_rank: 'QS #498' },
    { name: "DUKSUNG WOMEN'S UNIVERSITY", qs_rank: '' },
    { name: 'KONYANG UNIVERSITY', qs_rank: '' },
    { name: 'SEOKYEONG UNIVERSITY', qs_rank: '' },
    { name: 'SEOUL THEOLOGICAL UNIVERSITY', qs_rank: '' },
    { name: "SEOUL WOMEN'S UNIVERSITY", qs_rank: '' },
    { name: 'SUNGKYUL UNIVERSITY', qs_rank: '' },
    { name: 'SUNMOON UNIVERSITY', qs_rank: '' },
    { name: 'PUSAN NATIONAL UNIVERSITY', qs_rank: 'QS #501-510' },
    { name: 'DANKOOK UNIVERSITY', qs_rank: 'QS #1001-1200' },
    { name: 'HONGIK UNIVERSITY', qs_rank: 'QS #1001-1200' },
    { name: "SOOKMYUNG WOMEN'S UNIVERSITY", qs_rank: 'QS #1001-1200' },
    { name: 'JEJU NATIONAL UNIVERSITY', qs_rank: 'QS #1201-1400' },
    { name: 'INHA TECHNICAL COLLEGE', qs_rank: 'College' },
    { name: 'KYUNGBOK UNIVERSITY', qs_rank: 'College' },
    { name: 'ULSAN COLLEGE', qs_rank: 'College' }
];

async function syncOnePercent() {
    console.log("Syncing 1% universities to Turso...");
    for (const uni of onePercentUnis) {
        // Try to update first
        const updateRes = await db.execute({
            sql: `UPDATE ai_universities SET is_1_percent = 1 WHERE name LIKE ?`,
            args: [`%${uni.name.split(' (')[0]}%`]
        });

        if (updateRes.rowsAffected === 0) {
            // Insert if it didn't exist
            await db.execute({
                sql: `INSERT INTO ai_universities (id, name, korean_name, is_1_percent, qs_rank, visa_status) 
                      VALUES (?, ?, ?, 1, ?, 'Yengillashtirilgan (1%)')`,
                args: [uni.name.toUpperCase().replace(/\s+/g, '_'), uni.name, uni.name, uni.qs_rank]
            });
            console.log(`Inserted: ${uni.name}`);
        } else {
            console.log(`Updated: ${uni.name}`);
        }
    }
    console.log("Done.");
}

syncOnePercent().catch(console.error);
