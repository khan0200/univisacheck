const db = require('../lib/db');

async function migrate() {
    console.log("Starting KMS migration...");

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS ai_knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category TEXT,
                topic TEXT,
                keywords TEXT, -- Stored as JSON string array
                aliases TEXT,  -- Stored as JSON string array
                language TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT,
                version INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1
            )
        `);
        console.log("ai_knowledge table created successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

migrate().catch(console.error);
