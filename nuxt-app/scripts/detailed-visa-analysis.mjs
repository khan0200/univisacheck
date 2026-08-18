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

  if (apiResp) {
    if (apiResp.entryDate) {
      const d = parseDate(apiResp.entryDate);
      if (d) return { date: d, source: 'apiResponse.entryDate', dateStr: apiResp.entryDate };
    }
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

  if (row.lastChecked) {
    const d = parseDate(row.lastChecked);
    if (d) return { date: d, source: 'row.lastChecked', dateStr: formatDate(d) };
  }

  return null;
}

async function detailedAnalysis() {
  const rows = await getRows();
  const uniqueStudents = new Map();
  for (const r of rows) {
    const p = String(r.passport || '').toUpperCase().trim();
    if (!p) continue;
    if (!uniqueStudents.has(p)) {
      uniqueStudents.set(p, r);
    } else {
      const existing = uniqueStudents.get(p);
      if ((!existing.apiResponse && r.apiResponse) || (existing.status === 'Pending' && r.status !== 'Pending')) {
        uniqueStudents.set(p, r);
      }
    }
  }

  const allRecords = [];
  for (const [passport, student] of uniqueStudents.entries()) {
    const status = String(student.status || '').toUpperCase();
    const isApproved = status.includes('APPROV') || status.includes('USED') || status.includes('ISSUED') || status.includes('TASDIQLANGAN');
    const isRejected = status.includes('REJECT') || status.includes('CANCEL') || status.includes('BEKOR') || status.includes('RAD');
    if (!isApproved && !isRejected) continue;

    const appDate = parseDate(student.applicationDate);
    if (!appDate) continue;

    const decision = extractDecisionDate(student);
    if (!decision) continue;

    const days = getDaysDiff(appDate, decision.date);
    allRecords.push({
      passport,
      fullName: student.fullName,
      status: isApproved ? 'APPROVED' : 'REJECTED',
      applicationDate: formatDate(appDate),
      decisionDate: formatDate(decision.date),
      days,
      visaType: student.visaType || 'Embassy'
    });
  }

  // Group by type
  console.log(`\n=== ALL DECIDED VISAS (${allRecords.length} total) ===\n`);
  
  function calcGroup(items, name) {
    const approved = items.filter(r => r.status === 'APPROVED');
    const rejected = items.filter(r => r.status === 'REJECTED');
    
    const sumAppDays = approved.reduce((s, r) => s + r.days, 0);
    const avgApp = approved.length ? sumAppDays / approved.length : 0;

    const sumRejDays = rejected.reduce((s, r) => s + r.days, 0);
    const avgRej = rejected.length ? sumRejDays / rejected.length : 0;

    const formula = (avgApp && avgRej) ? (avgApp + avgRej) / 2 : (avgApp || avgRej);
    const weighted = items.length ? (sumAppDays + sumRejDays) / items.length : 0;

    console.log(`--- ${name} ---`);
    console.log(`Approved: ${approved.length} cases, total ${sumAppDays} days -> avg = ${avgApp.toFixed(2)} days`);
    console.log(`Rejected: ${rejected.length} cases, total ${sumRejDays} days -> avg = ${avgRej.toFixed(2)} days`);
    console.log(`Formula average ((avgApp + avgRej) / 2) = ${formula.toFixed(2)} days (~${Math.round(formula)} days)`);
    console.log(`Weighted average = ${weighted.toFixed(2)} days (~${Math.round(weighted)} days)\n`);
  }

  calcGroup(allRecords, 'ALL APPLICATIONS COMBINED');
  calcGroup(allRecords.filter(r => r.visaType === 'Embassy'), 'EMBASSY VISAS');
  calcGroup(allRecords.filter(r => r.visaType === 'E-Visa'), 'E-VISA');
  calcGroup(allRecords.filter(r => r.visaType === 'Regional'), 'REGIONAL VISAS');

  // Let's also look at 2026 current intake (application date >= 2026-06-01)
  calcGroup(allRecords.filter(r => r.applicationDate >= '2026-06-01'), 'CURRENT 2026 SUMMER/FALL INTAKE (Applied June 2026 or later)');
}

detailedAnalysis().catch(console.error);
