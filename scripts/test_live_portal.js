import fs from 'fs';
import { checkStudentVisaStatus } from './nuxt-app/server/lib/visa.ts';

async function main() {
  console.log('Checking FA0135684 on visa.go.kr...');
  const res = await checkStudentVisaStatus(
    'FA0135684',
    'ABDURAZZAKOV JASURBEK BEGIJON UGLI',
    '1997-10-12',
    'E-Visa',
    '7116290001'
  );
  console.log('Live Portal Result:', JSON.stringify(res, null, 2));
}

main().catch(console.error);
