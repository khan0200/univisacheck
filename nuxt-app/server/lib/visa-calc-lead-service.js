const db = require('./db')

function normalizePhone(phone) {
  if (!phone) return null
  // Digits only, no "+" -- the extractor isn't consistent about including
  // it, and keeping it sometimes/not-others would split one student's
  // phone across two different lead rows.
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

// Every field here is written via COALESCE(new, existing) so a later turn
// with less information never blanks out something already captured.
const FIELDS = [
  'full_name', 'age', 'university_name', 'parent_income_info',
  'language_certificate', 'planned_language_certificate', 'university_type',
  'father_official_income', 'father_monthly_salary', 'father_house', 'father_vehicle',
  'mother_official_income', 'mother_monthly_salary', 'mother_house', 'mother_vehicle',
  'business_info', 'self_employed_status', 'grandparents_pension',
  'temp_bank_deposit_availability', 'sponsor_availability', 'parent_deceased_status',
  'estimated_visa_approval_percentage', 'ai_generated_comment'
]

// Fields that indicate the interview has genuinely started beyond just
// name/phone -- used to auto-advance status from NEW to IN_PROGRESS.
const SUBSTANTIVE_FIELDS = FIELDS.filter(f => !['full_name', 'parent_income_info'].includes(f))

// NEW -> IN_PROGRESS -> COMPLETED is auto-managed by this service as the
// interview progresses. CONTACTED/ENROLLED/CANCELLED are staff-only (set
// via leads.html) and must never be auto-overwritten once set.
const AUTO_MANAGED_STATUSES = ['NEW', 'IN_PROGRESS', 'COMPLETED']
const STATUS_RANK = { NEW: 0, IN_PROGRESS: 1, COMPLETED: 2 }

function computeAutoStatus(currentStatus, extracted) {
  if (!AUTO_MANAGED_STATUSES.includes(currentStatus)) return currentStatus // staff has taken over

  const hasRecommendation = !!(extracted.estimated_visa_approval_percentage || extracted.ai_generated_comment)
  const hasSubstantiveAnswer = SUBSTANTIVE_FIELDS.some(f => extracted[f])

  let target = currentStatus
  if (hasRecommendation) target = 'COMPLETED'
  else if (hasSubstantiveAnswer) target = 'IN_PROGRESS'

  // Never regress (e.g. a later turn re-extracting less than before).
  return STATUS_RANK[target] > STATUS_RANK[currentStatus] ? target : currentStatus
}

class VisaCalcLeadService {
  // Looks up whatever is already known for a phone number, so the
  // extractor can be given a compact "already known" summary instead of
  // needing the full conversation history re-sent every turn.
  async findByPhone(rawPhone) {
    const phone = normalizePhone(rawPhone)
    if (!phone) return null
    try {
      const res = await db.execute({
        sql: `SELECT ${FIELDS.join(', ')} FROM visa_calc_leads WHERE phone = ?`,
        args: [phone]
      })
      return res.rows[0] || null
    } catch (error) {
      console.error('VisaCalcLeadService.findByPhone Error:', error.message)
      return null
    }
  }

  // Upserts by phone. Only non-null fields in `extracted` get written.
  async saveLead(extracted) {
    const phone = normalizePhone(extracted && extracted.phone)
    if (!phone) return null

    const values = FIELDS.map(f => extracted[f] || null)

    try {
      const existing = await db.execute({
        sql: `SELECT id, status FROM visa_calc_leads WHERE phone = ?`,
        args: [phone]
      })

      if (existing.rows.length === 0) {
        const initialStatus = computeAutoStatus('NEW', extracted)
        await db.execute({
          sql: `INSERT INTO visa_calc_leads (phone, status, ${FIELDS.join(', ')})
                          VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')})`,
          args: [phone, initialStatus, ...values]
        })
      } else {
        const nextStatus = computeAutoStatus(existing.rows[0].status, extracted)
        const setClause = FIELDS.map(f => `${f} = COALESCE(?, ${f})`).join(', ')
        await db.execute({
          sql: `UPDATE visa_calc_leads SET ${setClause}, status = ?, updated_at = datetime('now') WHERE phone = ?`,
          args: [...values, nextStatus, phone]
        })
      }
      return phone
    } catch (error) {
      console.error('VisaCalcLeadService Error:', error.message)
      return null
    }
  }
}

module.exports = new VisaCalcLeadService()
module.exports.normalizePhone = normalizePhone
