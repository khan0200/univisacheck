<script setup lang="ts">
import type { Lead } from '~/types/lead'
import { yn } from '~/utils/lead-format'

const props = defineProps<{ open: boolean, lead: Lead | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

interface DetailRow { label: string, value: string | null | undefined, fullSpan?: boolean }
interface DetailSection { title: string, rows: DetailRow[] }

const sections = computed<DetailSection[]>(() => {
  const l = props.lead
  if (!l) return []
  return [
    {
      title: 'Asosiy ma\'lumot',
      rows: [
        { label: 'Telefon', value: `+${l.phone}` },
        { label: 'Yosh', value: l.age },
        { label: 'Universitet', value: l.university_name },
        { label: 'Universitet turi', value: l.university_type === '1_percent' ? '1% akkreditatsiya' : l.university_type === 'standard' ? 'Standart' : l.university_type },
        { label: 'Til sertifikati', value: l.language_certificate },
        { label: 'Rejalashtirilgan sertifikat', value: l.planned_language_certificate }
      ]
    },
    {
      title: 'Ota',
      rows: [
        { label: 'Rasmiy daromad', value: yn(l.father_official_income) },
        { label: 'Oylik maosh', value: l.father_monthly_salary },
        { label: 'Uy/Kvartira', value: yn(l.father_house) },
        { label: 'Avtomobil', value: yn(l.father_vehicle) }
      ]
    },
    {
      title: 'Ona',
      rows: [
        { label: 'Rasmiy daromad', value: yn(l.mother_official_income) },
        { label: 'Oylik maosh', value: l.mother_monthly_salary },
        { label: 'Uy/Kvartira', value: yn(l.mother_house) },
        { label: 'Avtomobil', value: yn(l.mother_vehicle) }
      ]
    },
    {
      title: 'Qo\'shimcha moliyaviy ma\'lumot',
      rows: [
        { label: 'Biznes', value: l.business_info },
        { label: 'O\'zini o\'zi band qilish', value: yn(l.self_employed_status) },
        { label: 'Buva-buvi pensiyasi', value: yn(l.grandparents_pension) },
        { label: 'Vaqtincha bank depoziti', value: yn(l.temp_bank_deposit_availability) },
        { label: 'Homiy mavjudmi', value: yn(l.sponsor_availability) },
        { label: 'Vafot etgan ota-ona', value: l.parent_deceased_status },
        { label: 'Ota-ona daromadi (erkin matn)', value: l.parent_income_info, fullSpan: true }
      ]
    },
    {
      title: 'AI natijasi',
      rows: [
        { label: 'Viza ehtimoli', value: l.estimated_visa_approval_percentage },
        { label: 'AI sharhi', value: l.ai_generated_comment, fullSpan: true }
      ]
    }
  ]
})
</script>

<template>
  <UModal
    :open="props.open"
    :title="props.lead?.full_name || `Talaba #${props.lead?.id}`"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="props.lead"
        class="space-y-6"
      >
        <div
          v-for="section in sections"
          :key="section.title"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2.5">
            {{ section.title }}
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="row in section.rows"
              :key="row.label"
              class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3"
              :class="{ 'col-span-2': row.fullSpan }"
            >
              <p class="text-[11px] text-[var(--color-text-secondary)] mb-1">
                {{ row.label }}
              </p>
              <p
                class="text-sm font-medium"
                :class="row.value ? 'text-[var(--color-text-primary)] dark:text-white' : 'text-[var(--color-text-secondary)]'"
              >
                {{ row.value || '—' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
