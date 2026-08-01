const db = require('../lib/db');

// Stores students who share contact info during an AI Visa Calculator
// conversation, so staff can follow up by phone or in person later.
// Keyed by phone -- the one field guaranteed to be present, even if the
// student writes only their number and leaves.
async function migrate() {
    console.log("Creating visa_calc_leads table...");
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS visa_calc_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE NOT NULL,
                full_name TEXT,
                university_name TEXT,
                parent_income_info TEXT,
                status TEXT DEFAULT 'new',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);
        console.log("visa_calc_leads table ready.");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate().catch(console.error);
