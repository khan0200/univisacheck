<script setup lang="ts">
import type { Lead } from '~/types/lead'
import { formatLeadDate, yn } from '~/utils/lead-format'
import { LEAD_STATUS_OPTIONS } from '~/utils/lead-format'

const emit = defineEmits<{
  details: [lead: Lead]
  edit: [lead: Lead]
  delete: [lead: Lead]
}>()

const leadsStore = useLeadsStore()
const { updateStatus } = useLeadsService()
const toast = useToast()

const columns: { field: string, label: string, sortable?: boolean }[] = [
  { field: 'full_name', label: 'Talaba', sortable: true },
  { field: 'language_certificate', label: 'Til sertifikati', sortable: true },
  { field: 'father_official_income', label: 'Ota daromadi' },
  { field: 'mother_official_income', label: 'Ona daromadi' },
  { field: 'financial', label: 'Moliyaviy holat' },
  { field: 'estimated_visa_approval_percentage', label: 'Viza %', sortable: true },
  { field: 'ai_generated_comment', label: 'AI sharh' },
  { field: 'status', label: 'Holat' },
  { field: 'created_at', label: 'Sana', sortable: true },
  { field: 'actions', label: '' }
]

function sortIcon(field: string) {
  if (leadsStore.sortField !== field) return 'i-lucide-chevrons-up-down'
  return leadsStore.sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

async function handleStatusChange(lead: Lead, status: Lead['status']) {
  const previous = lead.status
  lead.status = status
  try {
    await updateStatus(lead.id, status)
    toast.add({ title: 'Holat yangilandi', color: 'success' })
  } catch (e: any) {
    lead.status = previous
    toast.add({ title: `Xatolik: ${e?.message || ''}`, color: 'error' })
  }
}

function incomeLabel(lead: Lead, side: 'father' | 'mother') {
  const income = side === 'father' ? lead.father_official_income : lead.mother_official_income
  const salary = side === 'father' ? lead.father_monthly_salary : lead.mother_monthly_salary
  if (income === 'deceased') return 'Vafot etgan'
  if (!income) return null
  return `${yn(income)}${salary ? ` · ${salary}` : ''}`
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-10 bg-white/95 dark:bg-[var(--color-card-dark)]/95 backdrop-blur">
        <tr class="border-b border-[var(--color-border)] dark:border-white/[0.08] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          <th
            v-for="col in columns"
            :key="col.field"
            class="px-4 py-3 whitespace-nowrap"
            :class="{ 'cursor-pointer select-none hover:text-primary-700': col.sortable }"
            @click="col.sortable && leadsStore.setSort(col.field)"
          >
            <span class="inline-flex items-center gap-1">
              {{ col.label }}
              <UIcon v-if="col.sortable" :name="sortIcon(col.field)" class="size-3.5" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
        <tr v-for="lead in leadsStore.pageRows" :key="lead.id" class="hover:bg-primary-50/60 dark:hover:bg-white/[0.03] transition-colors">
          <td class="px-4 py-3 align-top">
            <p class="font-medium text-[var(--color-text-primary)] dark:text-white">
              {{ lead.full_name || '—' }}
              <span v-if="lead.age" class="text-[var(--color-text-secondary)] font-normal">({{ lead.age }} yosh)</span>
            </p>
            <a :href="`tel:+${lead.phone}`" class="text-xs text-[var(--color-text-secondary)] hover:text-primary-700">+{{ lead.phone }}</a>
          </td>
          <td class="px-4 py-3 align-top">
            <span v-if="lead.language_certificate">{{ lead.language_certificate }}</span>
            <span v-else-if="lead.planned_language_certificate" class="text-[var(--color-text-secondary)]">Reja: {{ lead.planned_language_certificate }}</span>
            <span v-else class="text-[var(--color-text-secondary)]">—</span>
          </td>
          <td class="px-4 py-3 align-top">{{ incomeLabel(lead, 'father') || '—' }}</td>
          <td class="px-4 py-3 align-top">{{ incomeLabel(lead, 'mother') || '—' }}</td>
          <td class="px-4 py-3 align-top"><DashboardLeadFinancialBadge :lead="lead" /></td>
          <td class="px-4 py-3 align-top">{{ lead.estimated_visa_approval_percentage || '—' }}</td>
          <td class="px-4 py-3 align-top max-w-[220px]">
            <p class="truncate text-[var(--color-text-secondary)]" :title="lead.ai_generated_comment">{{ lead.ai_generated_comment || '—' }}</p>
          </td>
          <td class="px-4 py-3 align-top">
            <USelect
              :model-value="lead.status"
              :items="LEAD_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))"
              value-key="value"
              label-key="label"
              size="sm"
              @update:model-value="handleStatusChange(lead, $event as Lead['status'])"
            />
          </td>
          <td class="px-4 py-3 align-top whitespace-nowrap text-[var(--color-text-secondary)] text-xs">{{ formatLeadDate(lead.created_at) }}</td>
          <td class="px-4 py-3 align-top">
            <div class="flex items-center justify-end gap-1">
              <UButton size="xs" color="neutral" variant="soft" @click="emit('details', lead)">Batafsil</UButton>
              <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" square aria-label="Tahrirlash" @click="emit('edit', lead)" />
              <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" square aria-label="O'chirish" @click="emit('delete', lead)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
