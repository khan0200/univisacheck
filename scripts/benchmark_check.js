import { checkStudentVisaStatus } from './nuxt-app/server/lib/visa.ts';

async function main() {
  console.log('Testing single student check performance...');
  const t0 = Date.now();
  try {
    const res = await checkStudentVisaStatus(
      'FB1963267',
      'TEST STUDENT',
      '2008-05-18',
      'Embassy',
      ''
    );
    console.log(`Finished in ${Date.now() - t0}ms. Result found: ${res.found}, status: ${res.latestStatus}`);
  } catch (err) {
    console.error(`Failed in ${Date.now() - t0}ms:`, err.message);
  }
}

main();
