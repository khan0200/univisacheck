import pg from 'pg';
import { createClient } from '@libsql/client';

const PG_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';
const TURSO_URL = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

async function getRows() {
  try {
    const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: 5000 });
    const res = await pool.query('SELECT passport, "fullName", status, "applicationDate", "visaType" FROM students');
    await pool.end();
    return res.rows;
  } catch (err) {
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    const res = await client.execute('SELECT passport, fullName, status, applicationDate, visaType FROM students');
    return res.rows;
  }
}

async function main() {
  const rows = await getRows();
  console.log(`Total rows in DB: ${rows.length}`);

  // Deduplicate by passport
  const map = new Map();
  for (const r of rows) {
    const p = String(r.passport || '').toUpperCase().trim();
    if (!p) continue;
    if (!map.has(p)) {
      map.set(p, r);
    } else {
      const ex = map.get(p);
      if (ex.status === 'Pending' && r.status !== 'Pending') {
        map.set(p, r);
      }
    }
  }

  const unique = Array.from(map.values());
  console.log(`Total unique applicants: ${unique.length}`);

  const statusCounts = {};
  for (const s of unique) {
    const st = String(s.status || 'Pending').trim();
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }

  console.log('\n--- Status Counts (Unique Passports) ---');
  console.log(statusCounts);

  let approved = 0;
  let rejected = 0;
  let inProgress = 0; // Under review, received, supplement
  let pending = 0;

  for (const s of unique) {
    const st = String(s.status || '').toUpperCase();
    if (st.includes('APPROV') || st.includes('USED') || st.includes('ISSUED') || st.includes('TASDIQLANGAN')) {
      approved++;
    } else if (st.includes('REJECT') || st.includes('CANCEL') || st.includes('BEKOR') || st.includes('RAD')) {
      rejected++;
    } else if (st.includes('REVIEW') || st.includes('RECEIV') || st.includes('SUPPLEM') || st.includes('심사') || st.includes('접수') || st.includes('보완')) {
      inProgress++;
    } else {
      pending++;
    }
  }

  const totalAll = unique.length;
  const totalDecided = approved + rejected;
  const totalActive = approved + rejected + inProgress;

  console.log(`\nApproved: ${approved}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`In-Progress (Under Review / Supplement / Received): ${inProgress}`);
  console.log(`Pending / Not yet applied: ${pending}`);
  console.log(`Total Decided (Approved + Rejected): ${totalDecided}`);
  console.log(`Total Active Applications (Decided + In Progress): ${totalActive}`);
  console.log(`Total Students: ${totalAll}`);

  console.log('\n--- Percentages ---');
  console.log(`1. Among DECIDED cases (${totalDecided}):`);
  console.log(`   Approval Rate: ${approved} / ${totalDecided} = ${((approved / totalDecided) * 100).toFixed(2)}%`);
  console.log(`   Rejection Rate: ${rejected} / ${totalDecided} = ${((rejected / totalDecided) * 100).toFixed(2)}%`);

  console.log(`\n2. Among ALL ACTIVE applications (${totalActive}):`);
  console.log(`   Approval Rate: ${approved} / ${totalActive} = ${((approved / totalActive) * 100).toFixed(2)}%`);
  console.log(`   (Total - Rejection) / Total: (${totalActive} - ${rejected}) / ${totalActive} = ${(((totalActive - rejected) / totalActive) * 100).toFixed(2)}%`);
  console.log(`   (Total - Rejection) / Approved: (${totalActive} - ${rejected}) / ${approved} = ${((totalActive - rejected) / approved).toFixed(2)} (${(((totalActive - rejected) / approved) * 100).toFixed(2)}%)`);

  // Current 2026 intake (>= June 2026)
  const intake2026 = unique.filter(s => s.applicationDate && s.applicationDate >= '2026-06-01');
  let app26 = 0, rej26 = 0, prog26 = 0;
  for (const s of intake2026) {
    const st = String(s.status || '').toUpperCase();
    if (st.includes('APPROV') || st.includes('USED') || st.includes('ISSUED')) app26++;
    else if (st.includes('REJECT') || st.includes('CANCEL')) rej26++;
    else prog26++;
  }
  const decided26 = app26 + rej26;
  const total26 = intake2026.length;
  console.log(`\n3. Current 2026 Intake (since June 2026) - ${total26} applications:`);
  console.log(`   Approved: ${app26}, Rejected: ${rej26}, In Progress: ${prog26}`);
  console.log(`   Approval Rate among Decided (${decided26}): ${((app26 / decided26) * 100).toFixed(2)}%`);
  console.log(`   Rejection Rate among Decided (${decided26}): ${((rej26 / decided26) * 100).toFixed(2)}%`);
  console.log(`   (Total - Rejection) / Total: (${total26} - ${rej26}) / ${total26} = ${(((total26 - rej26) / total26) * 100).toFixed(2)}%`);

  // Breakdown by Visa Type
  console.log('\n--- By Visa Type (Decided cases) ---');
  for (const type of ['Embassy', 'E-Visa', 'Regional']) {
    const group = unique.filter(s => (s.visaType || 'Embassy') === type);
    const grpApp = group.filter(s => String(s.status).toUpperCase().match(/APPROV|USED|ISSUED/)).length;
    const grpRej = group.filter(s => String(s.status).toUpperCase().match(/REJECT|CANCEL/)).length;
    const grpDec = grpApp + grpRej;
    if (grpDec > 0) {
      console.log(`   ${type}: Approved = ${grpApp}, Rejected = ${grpRej}, Total Decided = ${grpDec} -> Approval Rate = ${((grpApp / grpDec) * 100).toFixed(2)}% (Rejection = ${((grpRej / grpDec) * 100).toFixed(2)}%)`);
    }
  }
}

main().catch(console.error);
