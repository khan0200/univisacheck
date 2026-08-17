import { checkStudentVisaStatus } from '../nuxt-app/server/lib/visa.ts';

async function test() {
  console.log('Testing visa check for FA8686092...');
  try {
    const res = await checkStudentVisaStatus(
      'FA8686092',
      'ISOKOVA BIBISARA MUZAFAR KIZI',
      '2000-06-27',
      'E-Visa',
      '7102350001'
    );
    console.log('Result:', res);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
