const db = require('../lib/db');

// Extends visa_calc_leads with the full D-2 bachelor-visa interview
// schema (father/mother income & assets, language certs, business,
// sponsor, estimated result). Keeps the original 4 columns (phone,
// full_name, university_name, parent_income_info) for backward
// compatibility -- new structured fields supersede parent_income_info
// going forward but nothing reads/writes are broken by keeping it.

const NEW_COLUMNS = [
    ['language_certificate', 'TEXT'],
    ['planned_language_certificate', 'TEXT'],
    ['university_type', 'TEXT'],
    ['father_official_income', 'TEXT'],
    ['father_monthly_salary', 'TEXT'],
    ['father_house', 'TEXT'],
    ['father_vehicle', 'TEXT'],
    ['mother_official_income', 'TEXT'],
    ['mother_monthly_salary', 'TEXT'],
    ['mother_house', 'TEXT'],
    ['mother_vehicle', 'TEXT'],
    ['business_info', 'TEXT'],
    ['self_employed_status', 'TEXT'],
    ['grandparents_pension', 'TEXT'],
    ['temp_bank_deposit_availability', 'TEXT'],
    ['sponsor_availability', 'TEXT'],
    ['parent_deceased_status', 'TEXT'],
    ['estimated_visa_approval_percentage', 'TEXT'],
    ['ai_generated_comment', 'TEXT'],
];

async function migrate() {
    console.log("Extending visa_calc_leads with full interview schema...");
    const existingCols = (await db.execute("PRAGMA table_info(visa_calc_leads)")).rows.map(r => r.name);

    for (const [name, type] of NEW_COLUMNS) {
        if (existingCols.includes(name)) {
            console.log(`  skip (exists): ${name}`);
            continue;
        }
        await db.execute(`ALTER TABLE visa_calc_leads ADD COLUMN ${name} ${type}`);
        console.log(`  added: ${name}`);
    }
    console.log("Done.");
}

migrate().catch(e => { console.error(e); process.exit(1); });
