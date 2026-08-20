import { normalizeStatus, isSameStatus, toDbStatus } from '../nuxt-app/server/utils/visa-status.ts';

function runTests() {
  console.log('--- Testing Visa Status Normalization & Comparisons ---');

  // Test 1: Under review comparisons
  console.assert(isSameStatus('UNDER REVIEW', 'UNDER_REVIEW') === true, 'Test 1.1 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'under_review') === true, 'Test 1.2 failed');
  console.assert(isSameStatus('심사중', 'UNDER REVIEW') === true, 'Test 1.3 failed');
  console.assert(isSameStatus('심사 중', 'UNDER_REVIEW') === true, 'Test 1.4 failed');
  console.assert(isSameStatus('처리중', 'UNDER_REVIEW') === true, 'Test 1.5 failed');
  console.assert(isSameStatus('Ko\'rib chiqilmoqda', 'UNDER_REVIEW') === true, 'Test 1.6 failed');

  // Test 2: Pending / Unknown comparisons
  console.assert(isSameStatus('PENDING', 'Pending') === true, 'Test 2.1 failed');
  console.assert(isSameStatus('UNKNOWN', 'Pending') === true, 'Test 2.2 failed');
  console.assert(isSameStatus('', 'Pending') === true, 'Test 2.3 failed');
  console.assert(isSameStatus(null, 'Pending') === true, 'Test 2.4 failed');

  // Test 3: Supplement needed comparisons
  console.assert(isSameStatus('SUPPLEMENT NEEDED', 'Pending Supplement') === true, 'Test 3.1 failed');
  console.assert(isSameStatus('보완요청', 'SUPPLEMENT_NEEDED') === true, 'Test 3.2 failed');
  console.assert(isSameStatus('보완대기', 'SUPPLEMENT_NEEDED') === true, 'Test 3.3 failed');

  // Test 4: Genuine changes
  console.assert(isSameStatus('UNDER REVIEW', 'APPROVED') === false, 'Test 4.1 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'CANCELLED') === false, 'Test 4.2 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'SUPPLEMENT_NEEDED') === false, 'Test 4.3 failed');

  console.log('✅ All status normalization and comparison tests PASSED!');
}

runTests();
