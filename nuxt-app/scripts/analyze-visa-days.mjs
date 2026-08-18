import pg from 'pg';
import { createClient } from '@libsql/client';

const PG_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';
const TURSO_URL = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

async function getRows() {
  try {
    console.log('Connecting to PostgreSQL...');
    const pool = new pg.Pool({
      connectionString: PG_URL,
      connectionTimeoutMillis: 5000
    });
    const res = await pool.query('SELECT passport, "fullName", status, "applicationDate", "lastChecked", "rejectReason", "apiResponse", "visaType" FROM students');
    await pool.end();
    console.log(`Fetched ${res.rows.length} rows from PostgreSQL.`);
    return res.rows;
  } catch (err) {
    console.warn('PostgreSQL failed, trying Turso...', err.message);
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    const res = await client.execute('SELECT passport, fullName, status, applicationDate, lastChecked, rejectReason, apiResponse, visaType FROM students');
    console.log(`Fetched ${res.rows.length} rows from Turso.`);
    return res.rows;
  }
}

function parseDate(str) {
  if (!str) return null;
  const match = String(str).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match) {
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function getDaysDiff(d1, d2) {
  // difference in full calendar days: d2 - d1
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

async function run() {
  const rows = await getRows();
  console.log(`Total records in DB: ${rows.length}`);

  const approvedList = [];
  const rejectedList = [];
  const otherList = [];

  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    const appDateStr = row.applicationDate || '';
    const appDate = parseDate(appDateStr);

    let apiResp = null;
    if (row.apiResponse) {
      try {
        apiResp = typeof row.apiResponse === 'string' ? JSON.parse(row.apiResponse) : row.apiResponse;
      } catch (e) {}
    }

    // Try to find decision date / entry date / given date
    let decisionDateStr = '';
    if (apiResp) {
      decisionDateStr = apiResp.entryDate || apiResp.givenDate || apiResp.statusDate || (apiResp.response_data?.visa_data?.entry_date) || (apiResp.visa_data?.entry_date) || '';
    }
    
    // If no explicit decision date in apiResponse, check if lastChecked or other fields have it
    let decisionDate = parseDate(decisionDateStr);

    const isApproved = status.includes('APPROV') || status.includes('USED') || status.includes('ISSUED') || status.includes('TASDIQLANGAN');
    const isRejected = status.includes('REJECT') || status.includes('CANCEL') || status.includes('BEKOR') || status.includes('RAD');

    if (isApproved) {
      approvedList.push({
        passport: row.passport,
        name: row.fullName,
        status: row.status,
        appDateStr,
        appDate,
        decisionDateStr,
        decisionDate,
        lastChecked: row.lastChecked,
        rawApi: apiResp
      });
    } else if (isRejected) {
      rejectedList.push({
        passport: row.passport,
        name: row.fullName,
        status: row.status,
        appDateStr,
        appDate,
        decisionDateStr,
        decisionDate,
        lastChecked: row.lastChecked,
        rawApi: apiResp
      });
    } else {
      otherList.push({
        passport: row.passport,
        name: row.fullName,
        status: row.status,
        appDateStr
      });
    }
  }

  console.log(`\n--- Summary of Statuses ---`);
  console.log(`Approved/Used: ${approvedList.length}`);
  console.log(`Rejected/Cancelled: ${rejectedList.length}`);
  console.log(`Other/Pending/Review: ${otherList.length}`);

  console.log(`\nSample Approved records:`);
  console.log(JSON.stringify(approvedList.slice(0, 5), null, 2));

  console.log(`\nSample Rejected records:`);
  console.log(JSON.stringify(rejectedList.slice(0, 5), null, 2));
}

run().catch(console.error);
