import { getTursoClient } from '../utils/turso'
import { requireAdmin } from '../utils/admin-auth'
import { apiError } from '../utils/api-error'

const ALLOWED_STATUSES = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CONTACTED', 'ENROLLED', 'CANCELLED']

// `fields` covers the manually-editable lead data (admin corrections from
// the dashboard); `status` is kept separate since it's also driven
// automatically by the AI lead-capture pipeline.
const EDITABLE_FIELDS = [
  'full_name', 'phone', 'age', 'university_name', 'university_type', 'parent_income_info',
  'language_certificate', 'planned_language_certificate',
  'father_official_income', 'father_monthly_salary', 'father_house', 'father_vehicle',
  'mother_official_income', 'mother_monthly_salary', 'mother_house', 'mother_vehicle',
  'business_info', 'self_employed_status', 'grandparents_pension',
  'temp_bank_deposit_availability', 'sponsor_availability', 'parent_deceased_status',
  'estimated_visa_approval_percentage', 'ai_generated_comment'
]

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = await getTursoClient()

  try {
    if (event.method === 'GET') {
      const result = await db.execute(
        `SELECT id, phone, full_name, age, university_name, university_type, parent_income_info,
                language_certificate, planned_language_certificate,
                father_official_income, father_monthly_salary, father_house, father_vehicle,
                mother_official_income, mother_monthly_salary, mother_house, mother_vehicle,
                business_info, self_employed_status, grandparents_pension,
                temp_bank_deposit_availability, sponsor_availability, parent_deceased_status,
                estimated_visa_approval_percentage, ai_generated_comment,
                status, created_at, updated_at
         FROM visa_calc_leads ORDER BY created_at DESC`
      )
      return result.rows
    }

    if (event.method === 'PATCH') {
      const body = (await readBody(event)) || {}
      const { id, status, fields } = body

      if (!id) apiError(400, 'Missing id')
      if (status !== undefined && !ALLOWED_STATUSES.includes(status)) apiError(400, 'Invalid status')

      const setParts: string[] = []
      const args: any[] = []
      if (fields && typeof fields === 'object') {
        for (const key of EDITABLE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(fields, key)) {
            setParts.push(`${key} = ?`)
            args.push(fields[key] === '' ? null : fields[key])
          }
        }
      }
      if (status !== undefined) {
        setParts.push('status = ?')
        args.push(status)
      }

      if (setParts.length === 0) apiError(400, 'Nothing to update')

      args.push(id)
      await db.execute({
        sql: `UPDATE visa_calc_leads SET ${setParts.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        args
      })
      return { success: true }
    }

    if (event.method === 'DELETE') {
      const query = getQuery(event)
      const body = (await readBody(event).catch(() => ({}))) || {}
      const id = query.id || body.id

      if (!id) apiError(400, 'Missing id')

      await db.execute({ sql: 'DELETE FROM visa_calc_leads WHERE id = ?', args: [id] })
      return { success: true }
    }

    apiError(405, 'Method not allowed')
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('[Visa Calc Leads API] Error:', err.message)
    apiError(500, err.message)
  }
})
