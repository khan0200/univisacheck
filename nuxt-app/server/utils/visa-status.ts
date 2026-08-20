/**
 * server/utils/visa-status.ts
 *
 * SINGLE SOURCE OF TRUTH for visa status normalization, comparison, display,
 * emoji, and description text.
 *
 * All modules MUST import from here — do NOT copy-paste normalizeStatus.
 *
 * Canonical internal status values (stored in DB, used for comparison):
 *   PENDING            - not yet found / awaiting submission
 *   APPROVED           - visa approved / issued
 *   VISA_USED          - visa used / 사용완료
 *   CANCELLED          - rejected / cancelled / returned
 *   RECEIVED           - application received
 *   UNDER_REVIEW       - under active review
 *   SUPPLEMENT_NEEDED  - documents required (보완요청, SUPPLEMENT NEEDED, PENDING SUPPLEMENT …)
 *   SUPPLEMENT_SUBMITTED - supplementary docs submitted
 *   EXPIRED            - application expired
 *   UNKNOWN            - unrecognized (treated like PENDING for comparison)
 */

export type CanonicalStatus
  = 'PENDING'
    | 'APPROVED'
    | 'VISA_USED'
    | 'CANCELLED'
    | 'RECEIVED'
    | 'UNDER_REVIEW'
    | 'SUPPLEMENT_NEEDED'
    | 'SUPPLEMENT_SUBMITTED'
    | 'EXPIRED'
    | 'UNKNOWN'

/**
 * Map any status string to a CanonicalStatus.
 * Handles raw API strings, DB values, Korean text, Uzbek text, display labels, canonical names.
 * Rules:
 *   - SUPPLEMENT_SUBMITTED checked BEFORE SUPPLEMENT_NEEDED (more specific first)
 *   - Unknown statuses → 'UNKNOWN' (not silently PENDING)
 */
export function normalizeStatus(status: unknown): CanonicalStatus {
  const raw = String(status ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  const s = raw.toLowerCase()

  if (!s || s === 'pending' || s === 'unknown' || s.includes('error') || s.includes('not found') || s.includes('topilmadi')) {
    return 'PENDING'
  }

  // VISA_USED (before APPROVED — more specific)
  if (s.includes('visa used') || s.includes('사용완료') || s.includes('ishlatilgan')) {
    return 'VISA_USED'
  }

  // APPROVED
  if (
    s.includes('approved')
    || s.includes('issued')
    || s.includes('허가')
    || s.includes('발급')
    || s.includes('tasdiqlangan')
  ) {
    return 'APPROVED'
  }

  // CANCELLED / REJECTED / RETURNED
  if (
    s.includes('cancel')
    || s.includes('reject')
    || s.includes('불허')
    || s.includes('취소')
    || s.includes('반려')
    || s.includes('returned')
    || s.includes('bekor')
    || s.includes('rad etil')
  ) {
    return 'CANCELLED'
  }

  // SUPPLEMENT_SUBMITTED (must come before SUPPLEMENT_NEEDED)
  if (
    s.includes('supplement submitted')
    || s.includes('supplement completed')
    || s.includes('보완완료')
    || s.includes('보완제출')
    || s.includes('보완접수')
  ) {
    return 'SUPPLEMENT_SUBMITTED'
  }

  // SUPPLEMENT_NEEDED — all variants map here
  if (
    s.includes('pending supplement')
    || s.includes('supplement needed')
    || s.includes('supplement')
    || s.includes('보완대기')
    || s.includes('보완요청')
    || s.includes('보완요구')
    || s.includes('보완')
    || s.includes('qo\'shimcha')
    || s.includes('asking')
  ) {
    return 'SUPPLEMENT_NEEDED'
  }

  // RECEIVED
  if (
    s.includes('received')
    || s.includes('접수')
    || s.includes('신청')
    || s.includes('qabul')
    || s.includes('app/')
  ) {
    return 'RECEIVED'
  }

  // UNDER_REVIEW
  if (
    s.includes('under review')
    || s.includes('심사중')
    || s.includes('심사 중')
    || s.includes('처리중')
    || s.includes('처리 중')
    || s.includes('ko\'rib')
    || s.includes('tayyorlanish')
  ) {
    return 'UNDER_REVIEW'
  }

  // EXPIRED
  if (s.includes('expired') || s.includes('기한만료')) {
    return 'EXPIRED'
  }

  return 'UNKNOWN'
}

/**
 * Returns true if two status values represent the same canonical state.
 * This is the ONLY gate for "did the status change?" decisions.
 *
 * isSameStatus('SUPPLEMENT NEEDED', 'PENDING SUPPLEMENT') === true
 * isSameStatus('SUPPLEMENT NEEDED', 'supplement_needed') === true
 * isSameStatus('UNKNOWN', 'PENDING') === true
 */
export function isSameStatus(a: unknown, b: unknown): boolean {
  const na = normalizeStatus(a)
  const nb = normalizeStatus(b)
  // UNKNOWN and PENDING are both "no information" — treat as same
  const eff = (s: CanonicalStatus) => (s === 'UNKNOWN' ? 'PENDING' : s)
  return eff(na) === eff(nb)
}

/**
 * Returns the canonical status string to store in the database.
 * Call this before every DB write — keeps the DB clean and human-readable.
 * Always returns 'UNDER REVIEW' (never 'under_review' or 'UNDER_REVIEW').
 */
export function toDbStatus(status: unknown): string {
  const norm = normalizeStatus(status)
  switch (norm) {
    case 'UNDER_REVIEW': return 'UNDER REVIEW'
    case 'APPROVED': return 'APPROVED'
    case 'VISA_USED': return 'VISA USED'
    case 'CANCELLED': return 'CANCELLED'
    case 'RECEIVED': return 'RECEIVED'
    case 'SUPPLEMENT_NEEDED': return 'SUPPLEMENT NEEDED'
    case 'SUPPLEMENT_SUBMITTED': return 'SUPPLEMENT SUBMITTED'
    case 'EXPIRED': return 'EXPIRED'
    case 'PENDING': return 'PENDING'
    default: return 'PENDING'
  }
}

/**
 * Human-readable display label for Telegram messages and cabinet UI.
 */
export function getDisplayStatus(status: unknown): string {
  switch (normalizeStatus(status)) {
    case 'APPROVED': return 'APPROVED'
    case 'VISA_USED': return 'VISA USED'
    case 'CANCELLED': return 'REJECTED'
    case 'SUPPLEMENT_SUBMITTED': return 'SUPPLEMENT SUBMITTED'
    case 'SUPPLEMENT_NEEDED': return 'SUPPLEMENT NEEDED'
    case 'RECEIVED': return 'RECEIVED'
    case 'UNDER_REVIEW': return 'UNDER REVIEW'
    case 'EXPIRED': return 'EXPIRED'
    case 'PENDING': return 'PENDING'
    default: return String(status || 'PENDING').toUpperCase()
  }
}

/** Emoji for a status. */
export function getStatusEmoji(status: unknown): string {
  switch (normalizeStatus(status)) {
    case 'APPROVED': return '\u{1F7E2}' // 🟢
    case 'VISA_USED': return '\u{1F7E2}' // 🟢
    case 'CANCELLED': return '\u{1F534}' // 🔴
    case 'SUPPLEMENT_SUBMITTED': return '\uD83D\uDCDD' // 📝
    case 'SUPPLEMENT_NEEDED': return '\u26A0\uFE0F' // ⚠️
    case 'RECEIVED': return '\u{1F7E0}' // 🟠
    case 'UNDER_REVIEW': return '\u{1F535}' // 🔵
    case 'EXPIRED': return '\u26D4' // ⛔
    case 'PENDING': return '\u{1F537}' // 🔷
    default: return '\u{1F537}' // 🔷
  }
}

/** Human-readable description for Telegram notification and card Result line. */
export function getStatusDescription(status: unknown, lang: 'uz' | 'en' = 'uz'): string {
  switch (normalizeStatus(status)) {
    case 'APPROVED':
    case 'VISA_USED':
      return lang === 'en' ? 'Congratulations \uD83C\uDF89' : 'Tabriklaymiz \uD83C\uDF89'
    case 'CANCELLED':
      return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.'
    case 'SUPPLEMENT_SUBMITTED':
      return lang === 'en'
        ? '\uD83D\uDCDD Supplementary documents have been submitted and are under review.'
        : '\uD83D\uDCDD Qo\'shimcha hujjatlar topshirildi va ko\'rib chiqilmoqda.'
    case 'SUPPLEMENT_NEEDED':
      return lang === 'en'
        ? '\u26A0\uFE0F Additional documents required (Supplement Needed).'
        : '\u26A0\uFE0F Qo\'shimcha hujjatlar talab qilinmoqda (Qo\'shimcha hujjat kerak).'
    case 'RECEIVED':
      return lang === 'en' ? '\u23F3 Your application is being processed.' : '\u23F3 Arizangiz jarayonda.'
    case 'UNDER_REVIEW':
      return lang === 'en' ? '\uD83D\uDD0E Under review.' : '\uD83D\uDD0E Ko\'rib chiqilmoqda.'
    case 'EXPIRED':
      return lang === 'en' ? '\u26D4 Application has expired.' : '\u26D4 Ariza muddati o\'tib ketdi.'
    case 'PENDING':
    case 'UNKNOWN':
    default:
      return lang === 'en' ? '\u2139\uFE0F No status change.' : '\u2139\uFE0F Status o\'zgarmadi.'
  }
}
