import pg from 'pg';
import { createClient } from '@libsql/client';

const PG_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';
const TURSO_URL = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

async function getRows() {
  try {
    const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: 5000 });
    const res = await pool.query('SELECT passport, "fullName", status, "applicationDate", "lastChecked", "rejectReason", "apiResponse", "visaType" FROM students');
    await pool.end();
    return res.rows;
  } catch (err) {
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    const res = await client.execute('SELECT passport, fullName, status, applicationDate, lastChecked, rejectReason, apiResponse, visaType FROM students');
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

async function main() {
  const rows = await getRows();
  const map = new Map();
  for (const r of rows) {
    const p = String(r.passport || '').toUpperCase().trim();
    if (!p) continue;
    if (!map.has(p)) {
      map.set(p, r);
    } else {
      const ex = map.get(p);
      if ((!ex.apiResponse && r.apiResponse) || (ex.status === 'Pending' && r.status !== 'Pending')) {
        map.set(p, r);
      }
    }
  }

  const embassyStudents = Array.from(map.values()).filter(s => (s.visaType || 'Embassy') === 'Embassy');

  console.log(`Total Embassy Students in DB: ${embassyStudents.length}`);

  let approved = 0;
  let rejected = 0;
  let inProgress = 0;
  let pending = 0;

  const approvedDaysList = [];
  const rejectedDaysList = [];

  for (const s of embassyStudents) {
    const st = String(s.status || '').toUpperCase();
    const isApp = st.includes('APPROV') || st.includes('USED') || st.includes('ISSUED') || st.includes('TASDIQLANGAN');
    const isRej = st.includes('REJECT') || st.includes('CANCEL') || st.includes('BEKOR') || st.includes('RAD');
    const isInProg = st.includes('REVIEW') || st.includes('RECEIV') || st.includes('SUPPLEM') || st.includes('심사') || st.includes('접수') || st.includes('보완');

    if (isApp) {
      approved++;
      const appDate = parseDate(s.applicationDate);
      const dec = extractDecisionDate(s);
      if (appDate && dec) {
        const days = getDaysDiff(appDate, dec.date);
        approvedDaysList.push({ passport: s.passport, name: s.fullName, appDate: formatDate(appDate), decDate: formatDate(dec.date), days });
      }
    } else if (isRej) {
      rejected++;
      const appDate = parseDate(s.applicationDate);
      const dec = extractDecisionDate(s);
      if (appDate && dec) {
        const days = getDaysDiff(appDate, dec.date);
        rejectedDaysList.push({ passport: s.passport, name: s.fullName, appDate: formatDate(appDate), decDate: formatDate(dec.date), days });
      }
    } else if (isInProg) {
      inProgress++;
    } else {
      pending++;
    }
  }

  const totalDecided = approved + rejected;
  const totalActive = approved + rejected + inProgress;

  console.log('\n--- EMBASSY STATUS COUNTS ---');
  console.log(`Approved / Visa Used: ${approved}`);
  console.log(`Rejected / Cancelled: ${rejected}`);
  console.log(`In Progress (Under Review / Received / Supplement): ${inProgress}`);
  console.log(`Pending / Not yet applied: ${pending}`);
  console.log(`Total Decided: ${totalDecided}`);
  console.log(`Total Active Submitted Applications: ${totalActive}`);
  console.log(`Total Embassy Records: ${embassyStudents.length}`);

  console.log('\n--- EMBASSY PERCENTAGE ---');
  const approvalRate = (approved / totalDecided) * 100;
  const rejectionRate = (rejected / totalDecided) * 100;
  console.log(`Approval Percentage: (${totalDecided} - ${rejected}) / ${totalDecided} = ${approved} / ${totalDecided} = ${approvalRate.toFixed(2)}%`);
  console.log(`Rejection Percentage: ${rejected} / ${totalDecided} = ${rejectionRate.toFixed(2)}%`);

  console.log('\n--- EMBASSY DAYS CALCULATION ---');
  const sumAppDays = approvedDaysList.reduce((s, r) => s + r.days, 0);
  const avgAppDays = sumAppDays / approvedDaysList.length;
  console.log(`Approved count with valid dates: ${approvedDaysList.length}, sum of days: ${sumAppDays}`);
  console.log(`averageapproved (Embassy) = ${sumAppDays} / ${approvedDaysList.length} = ${avgAppDays.toFixed(2)} days`);

  const sumRejDays = rejectedDaysList.reduce((s, r) => s + r.days, 0);
  const avgRejDays = sumRejDays / rejectedDaysList.length;
  console.log(`Rejected count with valid dates: ${rejectedDaysList.length}, sum of days: ${sumRejDays}`);
  console.log(`averagerejection (Embassy) = ${sumRejDays} / ${rejectedDaysList.length} = ${avgRejDays.toFixed(2)} days`);

  const formulaAvgDays = (avgAppDays + avgRejDays) / 2;
  console.log(`averagevisagivendate (Embassy) = (${avgAppDays.toFixed(2)} + ${avgRejDays.toFixed(2)}) / 2 = ${formulaAvgDays.toFixed(2)} days (~${Math.round(formulaAvgDays)} days)`);

  // Current 2026 Intake for Embassy
  const cur2026 = embassyStudents.filter(s => s.applicationDate && s.applicationDate >= '2026-06-01');
  let curApp = 0, curRej = 0;
  const curAppDays = [], curRejDays = [];
  for (const s of cur2026) {
    const st = String(s.status || '').toUpperCase();
    const isApp = st.includes('APPROV') || st.includes('USED') || st.includes('ISSUED');
    const isRej = st.includes('REJECT') || st.includes('CANCEL');
    const appDate = parseDate(s.applicationDate);
    const dec = extractDecisionDate(s);
    if (isApp) {
      curApp++;
      if (appDate && dec) curAppDays.push(getDaysDiff(appDate, dec.date));
    } else if (isRej) {
      curRej++;
      if (appDate && dec) curRejDays.push(getDaysDiff(appDate, dec.date));
    }
  }
  const curDec = curApp + curRej;
  console.log('\n--- 2026 SUMMER/FALL INTAKE (EMBASSY ONLY) ---');
  console.log(`Approved: ${curApp}, Rejected: ${curRej}, Total Decided: ${curDec}`);
  console.log(`2026 Approval Rate: ${((curApp / curDec) * 100).toFixed(2)}%`);
  console.log(`2026 Rejection Rate: ${((curRej / curDec) * 100).toFixed(2)}%`);
  const curAvgApp = curAppDays.reduce((a,b)=>a+b,0) / curAppDays.length;
  const curAvgRej = curRejDays.reduce((a,b)=>a+b,0) / curRejDays.length;
  console.log(`2026 Avg Approved Days: ${curAvgApp.toFixed(2)}, Avg Rejected Days: ${curAvgRej.toFixed(2)}`);
  console.log(`2026 Formula Avg Days: ${((curAvgApp + curAvgRej)/2).toFixed(2)} days (~${Math.round((curAvgApp + curAvgRej)/2)} days)`);
}

main().catch(console.error);
