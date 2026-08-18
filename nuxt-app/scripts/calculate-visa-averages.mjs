import pg from 'pg';
import { createClient } from '@libsql/client';

const PG_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';
const TURSO_URL = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

async function getRows() {
  try {
    const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: 5000 });
    const res = await pool.query('SELECT passport, "fullName", status, "applicationDate", "lastChecked", "rejectReason", "apiResponse", "visaType", "createdAt" FROM students');
    await pool.end();
    return res.rows;
  } catch (err) {
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    const res = await client.execute('SELECT passport, fullName, status, applicationDate, lastChecked, rejectReason, apiResponse, visaType, createdAt FROM students');
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

function formatDate(d) {
  if (!d) return '—';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysDiff(d1, d2) {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

function extractDecisionDate(row) {
  let apiResp = null;
  if (row.apiResponse) {
    try {
      apiResp = typeof row.apiResponse === 'string' ? JSON.parse(row.apiResponse) : row.apiResponse;
    } catch (e) {}
  }

  // Check apiResp fields
  if (apiResp) {
    // 1. Check entryDate (신청일자/허가일자/불허일자 from scraping)
    if (apiResp.entryDate) {
      const d = parseDate(apiResp.entryDate);
      if (d) return { date: d, source: 'apiResponse.entryDate', dateStr: apiResp.entryDate };
    }
    // 2. Check korean status for date e.g. "허가 (2026.08.14.)" or "불허 (2026.07.20.)"
    const kor = apiResp.latestStatusKorean || apiResp.statusKorean || '';
    const korMatch = kor.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (korMatch) {
      const d = new Date(parseInt(korMatch[1], 10), parseInt(korMatch[2], 10) - 1, parseInt(korMatch[3], 10));
      return { date: d, source: 'apiResponse.latestStatusKorean', dateStr: `${korMatch[1]}-${korMatch[2]}-${korMatch[3]}` };
    }
    if (apiResp.givenDate) {
      const d = parseDate(apiResp.givenDate);
      if (d) return { date: d, source: 'apiResponse.givenDate', dateStr: apiResp.givenDate };
    }
    if (apiResp.statusDate) {
      const d = parseDate(apiResp.statusDate);
      if (d) return { date: d, source: 'apiResponse.statusDate', dateStr: apiResp.statusDate };
    }
  }

  // Fallback to lastChecked if available
  if (row.lastChecked) {
    const d = parseDate(row.lastChecked);
    if (d) return { date: d, source: 'row.lastChecked', dateStr: formatDate(d) };
  }

  return null;
}

async function main() {
  const rows = await getRows();
  console.log(`Total students in database: ${rows.length}`);

  // Deduplicate by passport (keep latest or most informative)
  const uniqueStudents = new Map();
  for (const r of rows) {
    const p = String(r.passport || '').toUpperCase().trim();
    if (!p) continue;
    if (!uniqueStudents.has(p)) {
      uniqueStudents.set(p, r);
    } else {
      // keep the one with apiResponse or non-empty status
      const existing = uniqueStudents.get(p);
      if ((!existing.apiResponse && r.apiResponse) || (existing.status === 'Pending' && r.status !== 'Pending')) {
        uniqueStudents.set(p, r);
      }
    }
  }

  console.log(`Unique passports: ${uniqueStudents.size}`);

  const approvedList = [];
  const rejectedList = [];

  for (const [passport, student] of uniqueStudents.entries()) {
    const status = String(student.status || '').toUpperCase();
    const isApproved = status.includes('APPROV') || status.includes('USED') || status.includes('ISSUED') || status.includes('TASDIQLANGAN');
    const isRejected = status.includes('REJECT') || status.includes('CANCEL') || status.includes('BEKOR') || status.includes('RAD');

    if (!isApproved && !isRejected) continue;

    const appDate = parseDate(student.applicationDate);
    if (!appDate) {
      console.log(`Skipping ${passport} (${status}) - missing applicationDate: "${student.applicationDate}"`);
      continue;
    }

    const decision = extractDecisionDate(student);
    if (!decision) {
      console.log(`Skipping ${passport} (${status}) - missing decisionDate`);
      continue;
    }

    const days = getDaysDiff(appDate, decision.date);
    if (days < 0 || days > 180) {
      console.log(`Anomaly date for ${passport} (${status}): App=${formatDate(appDate)}, Decision=${formatDate(decision.date)}, Diff=${days} days`);
      // check if it should be excluded or kept
    }

    const item = {
      passport,
      fullName: student.fullName,
      status: isApproved ? 'APPROVED' : 'REJECTED',
      applicationDate: formatDate(appDate),
      decisionDate: formatDate(decision.date),
      decisionSource: decision.source,
      days,
      visaType: student.visaType
    };

    if (isApproved) {
      approvedList.push(item);
    } else {
      rejectedList.push(item);
    }
  }

  console.log(`\n========================================`);
  console.log(`APPROVED VISAS (Count: ${approvedList.length})`);
  console.log(`========================================`);
  console.table(approvedList.map((a, i) => ({
    '#': i + 1,
    Passport: a.passport,
    Name: a.fullName?.slice(0, 25),
    'App Date': a.applicationDate,
    'Approved Date': a.decisionDate,
    'Days': a.days,
    'Visa Type': a.visaType
  })));

  const totalApprovedDays = approvedList.reduce((sum, item) => sum + item.days, 0);
  const avgApproved = approvedList.length > 0 ? (totalApprovedDays / approvedList.length) : 0;

  console.log(`Total Approved Days: ${totalApprovedDays}`);
  console.log(`Average Approved Days: ${avgApproved.toFixed(2)} (${totalApprovedDays} / ${approvedList.length})`);

  console.log(`\n========================================`);
  console.log(`REJECTED VISAS (Count: ${rejectedList.length})`);
  console.log(`========================================`);
  console.table(rejectedList.map((r, i) => ({
    '#': i + 1,
    Passport: r.passport,
    Name: r.fullName?.slice(0, 25),
    'App Date': r.applicationDate,
    'Rejection Date': r.decisionDate,
    'Days': r.days,
    'Visa Type': r.visaType
  })));

  const totalRejectedDays = rejectedList.reduce((sum, item) => sum + item.days, 0);
  const avgRejected = rejectedList.length > 0 ? (totalRejectedDays / rejectedList.length) : 0;

  console.log(`Total Rejected Days: ${totalRejectedDays}`);
  console.log(`Average Rejected Days: ${avgRejected.toFixed(2)} (${totalRejectedDays} / ${rejectedList.length})`);

  const formulaResult = (avgApproved + avgRejected) / 2;
  const overallWeightedAvg = (totalApprovedDays + totalRejectedDays) / (approvedList.length + rejectedList.length);

  console.log(`\n========================================`);
  console.log(`FINAL CALCULATION RESULTS:`);
  console.log(`========================================`);
  console.log(`averageapproved = ${avgApproved.toFixed(2)} days (over ${approvedList.length} approved visas)`);
  console.log(`averagerejection = ${avgRejected.toFixed(2)} days (over ${rejectedList.length} rejected visas)`);
  console.log(`averagevisagivendate = (averageapproved + averagerejection) / 2 = (${avgApproved.toFixed(2)} + ${avgRejected.toFixed(2)}) / 2 = ${formulaResult.toFixed(2)} days (~${Math.round(formulaResult)} days)`);
  console.log(`(Overall weighted mean across all ${approvedList.length + rejectedList.length} decided applications = ${overallWeightedAvg.toFixed(2)} days, ~${Math.round(overallWeightedAvg)} days)`);
}

main().catch(console.error);
