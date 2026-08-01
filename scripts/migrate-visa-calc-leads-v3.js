const db = require('../lib/db');

// v3: adds the `age` column (explicitly called out as an extraction
// target), and migrates the lead_status enum from the old
// new/contacted/converted/closed to the new lifecycle:
//   NEW -> IN_PROGRESS -> COMPLETED (auto-managed by the AI pipeline)
//   CONTACTED, ENROLLED, CANCELLED (staff-managed only, set via leads.html)
async function migrate() {
    console.log("Migrating visa_calc_leads to v3 schema...");

    const existingCols = (await db.execute("PRAGMA table_info(visa_calc_leads)")).rows.map(r => r.name);
    if (!existingCols.includes('age')) {
        await db.execute(`ALTER TABLE visa_calc_leads ADD COLUMN age TEXT`);
        console.log("  added: age");
    } else {
        console.log("  skip (exists): age");
    }

    const STATUS_MAP = {
        new: 'NEW',
        contacted: 'CONTACTED',
        converted: 'ENROLLED',
        closed: 'CANCELLED'
    };
    for (const [oldVal, newVal] of Object.entries(STATUS_MAP)) {
        const res = await db.execute({
            sql: `UPDATE visa_calc_leads SET status = ? WHERE status = ?`,
            args: [newVal, oldVal]
        });
        if (res.rowsAffected) console.log(`  status '${oldVal}' -> '${newVal}': ${res.rowsAffected} row(s)`);
    }

    console.log("Done.");
}

migrate().catch(e => { console.error(e); process.exit(1); });
