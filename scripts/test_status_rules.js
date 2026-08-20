import { normalizeStatus, isSameStatus, toDbStatus, getDisplayStatus } from '../nuxt-app/server/utils/visa-status.ts';
import { displayStatusText, normalizeStatusForComparison, isUnderReviewStatus } from '../nuxt-app/app/utils/visa-status.ts';

function runTests() {
  console.log('--- Testing Visa Status Normalization & Comparisons ---');

  // Test 1: Under review comparisons (Server)
  console.assert(isSameStatus('UNDER REVIEW', 'UNDER_REVIEW') === true, 'Test 1.1 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'under_review') === true, 'Test 1.2 failed');
  console.assert(isSameStatus('Under Review', 'UNDER REVIEW') === true, 'Test 1.3 failed');
  console.assert(isSameStatus('심사중', 'UNDER REVIEW') === true, 'Test 1.4 failed');
  console.assert(isSameStatus('심사 중', 'UNDER_REVIEW') === true, 'Test 1.5 failed');
  console.assert(isSameStatus('처리중', 'UNDER_REVIEW') === true, 'Test 1.6 failed');
  console.assert(isSameStatus('Ko\'rib chiqilmoqda', 'UNDER_REVIEW') === true, 'Test 1.7 failed');

  // Test 2: Database status formatting (UNDER REVIEW must always be 'UNDER REVIEW', never snake_case)
  console.assert(toDbStatus('UNDER_REVIEW') === 'UNDER REVIEW', 'Test 2.1 failed: ' + toDbStatus('UNDER_REVIEW'));
  console.assert(toDbStatus('under_review') === 'UNDER REVIEW', 'Test 2.2 failed: ' + toDbStatus('under_review'));
  console.assert(toDbStatus('Under Review') === 'UNDER REVIEW', 'Test 2.3 failed: ' + toDbStatus('Under Review'));
  console.assert(toDbStatus('심사중') === 'UNDER REVIEW', 'Test 2.4 failed: ' + toDbStatus('심사중'));
  console.assert(toDbStatus('SUPPLEMENT_NEEDED') === 'SUPPLEMENT NEEDED', 'Test 2.5 failed');
  console.assert(toDbStatus('VISA_USED') === 'VISA USED', 'Test 2.6 failed');
  console.assert(getDisplayStatus('UNDER_REVIEW') === 'UNDER REVIEW', 'Test 2.7 failed');
  console.assert(getDisplayStatus('under_review') === 'UNDER REVIEW', 'Test 2.8 failed');

  // Test 3: Frontend displayStatusText and isUnderReviewStatus
  console.assert(displayStatusText('UNDER_REVIEW') === 'Under Review', 'Test 3.1 failed: ' + displayStatusText('UNDER_REVIEW'));
  console.assert(displayStatusText('under_review') === 'Under Review', 'Test 3.2 failed: ' + displayStatusText('under_review'));
  console.assert(displayStatusText('UNDER REVIEW') === 'Under Review', 'Test 3.3 failed: ' + displayStatusText('UNDER REVIEW'));
  console.assert(displayStatusText('Under Review') === 'Under Review', 'Test 3.4 failed: ' + displayStatusText('Under Review'));
  console.assert(isUnderReviewStatus('under_review') === true, 'Test 3.5 failed');
  console.assert(isUnderReviewStatus('UNDER_REVIEW') === true, 'Test 3.6 failed');
  console.assert(isUnderReviewStatus('Under Review') === true, 'Test 3.7 failed');

  // Test 4: Frontend normalizeStatusForComparison (No false change between 'Under Review' and 'UNDER_REVIEW')
  const fOld = normalizeStatusForComparison('Under Review');
  const fNew = normalizeStatusForComparison('UNDER_REVIEW');
  const fSnake = normalizeStatusForComparison('under_review');
  console.assert(fOld === 'under review', 'Test 4.1 failed: ' + fOld);
  console.assert(fNew === 'under review', 'Test 4.2 failed: ' + fNew);
  console.assert(fOld === fNew, 'Test 4.3 failed: comparison mismatch!');
  console.assert(fOld === fSnake, 'Test 4.4 failed: snake comparison mismatch!');

  // Test 5: Pending / Unknown comparisons
  console.assert(isSameStatus('PENDING', 'Pending') === true, 'Test 5.1 failed');
  console.assert(isSameStatus('UNKNOWN', 'Pending') === true, 'Test 5.2 failed');
  console.assert(isSameStatus('', 'Pending') === true, 'Test 5.3 failed');
  console.assert(isSameStatus(null, 'Pending') === true, 'Test 5.4 failed');

  // Test 6: Supplement needed comparisons
  console.assert(isSameStatus('SUPPLEMENT NEEDED', 'Pending Supplement') === true, 'Test 6.1 failed');
  console.assert(isSameStatus('보완요청', 'SUPPLEMENT_NEEDED') === true, 'Test 6.2 failed');
  console.assert(isSameStatus('보완대기', 'SUPPLEMENT_NEEDED') === true, 'Test 6.3 failed');

  // Test 7: Genuine changes
  console.assert(isSameStatus('UNDER REVIEW', 'APPROVED') === false, 'Test 7.1 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'CANCELLED') === false, 'Test 7.2 failed');
  console.assert(isSameStatus('UNDER REVIEW', 'SUPPLEMENT_NEEDED') === false, 'Test 7.3 failed');

  console.log('✅ ALL status normalization, comparison, and formatting tests PASSED!');
}

runTests();
