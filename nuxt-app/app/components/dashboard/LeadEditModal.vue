<script setup lang="ts">
import type { Lead } from '~/types/lead'

const props = defineProps<{ open: boolean, lead: Lead | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], saved: [] }>()

type FieldType = 'text' | 'select' | 'textarea'
interface EditField {
  key: keyof Lead
  label: string
  type: FieldType
  options?: [string, string][]
  fullSpan?: boolean
}
interface EditGroup { section: string, fields: EditField[] }

const YN_OPTIONS: [string, string][] = [['', "Noma'lum"], ['yes', 'Ha'], ['no', "Yo'q"]]

const EDIT_GROUPS: EditGroup[] = [
  {
    section: "Asosiy ma'lumot",
    fields: [
      { key: 'full_name', label: 'Ism-familiya', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'age', label: 'Yosh', type: 'text' },
      { key: 'university_name', label: 'Universitet', type: 'text' },
      { key: 'university_type', label: 'Universitet turi', type: 'select', options: [['', "Noma'lum"], ['1_percent', '1% akkreditatsiya'], ['standard', 'Standart'], ['not_sure', 'Bilmayman']] },
      { key: 'language_certificate', label: 'Til sertifikati', type: 'text' },
      { key: 'planned_language_certificate', label: 'Rejalashtirilgan sertifikat', type: 'text' }
    ]
  },
  {
    section: 'Ota',
    fields: [
      { key: 'father_official_income', label: 'Rasmiy daromad', type: 'select', options: [['', "Noma'lum"], ['yes', 'Ha'], ['no', "Yo'q"], ['deceased', 'Vafot etgan']] },
      { key: 'father_monthly_salary', label: 'Oylik maosh', type: 'text' },
      { key: 'father_house', label: 'Uy/Kvartira', type: 'select', options: YN_OPTIONS },
      { key: 'father_vehicle', label: 'Avtomobil', type: 'select', options: YN_OPTIONS }
    ]
  },
  {
    section: 'Ona',
    fields: [
      { key: 'mother_official_income', label: 'Rasmiy daromad', type: 'select', options: [['', "Noma'lum"], ['yes', 'Ha'], ['no', "Yo'q"], ['deceased', 'Vafot etgan']] },
      { key: 'mother_monthly_salary', label: 'Oylik maosh', type: 'text' },
      { key: 'mother_house', label: 'Uy/Kvartira', type: 'select', options: YN_OPTIONS },
      { key: 'mother_vehicle', label: 'Avtomobil', type: 'select', options: YN_OPTIONS }
    ]
  },
  {
    section: "Qo'shimcha moliyaviy ma'lumot",
    fields: [
      { key: 'business_info', label: 'Biznes', type: 'textarea', fullSpan: true },
      { key: 'self_employed_status', label: "O'zini o'zi band qilish", type: 'select', options: YN_OPTIONS },
      { key: 'grandparents_pension', label: 'Buva-buvi pensiyasi', type: 'select', options: YN_OPTIONS },
      { key: 'temp_bank_deposit_availability', label: 'Vaqtincha bank depoziti', type: 'select', options: [['', "Noma'lum"], ['yes', 'Ha'], ['no', "Yo'q"], ['not_sure', 'Bilmayman']] },
      { key: 'sponsor_availability', label: 'Homiy mavjudmi', type: 'select', options: YN_OPTIONS },
      { key: 'parent_deceased_status', label: 'Vafot etgan ota-ona', type: 'text' },
      { key: 'parent_income_info', label: 'Ota-ona daromadi (erkin matn)', type: 'textarea', fullSpan: true }
    ]
  },
  {
    section: 'AI natijasi',
    fields: [
      { key: 'estimated_visa_approval_percentage', label: 'Viza ehtimoli', type: 'text' },
      { key: 'ai_generated_comment', label: 'AI sharhi', type: 'textarea', fullSpan: true }
    ]
  }
]

const toast = useToast()
const { updateFields } = useLeadsService()
const leadsStore = useLeadsStore()

const formValues = reactive<Record<string, string>>({})
const saving = ref(false)

watch(() => props.open, (open) => {
  if (!open || !props.lead) return
  for (const group of EDIT_GROUPS) {
    for (const field of group.fields) {
      formValues[field.key as string] = String(props.lead[field.key] ?? '')
    }
  }
})

async function handleSave() {
  if (!props.lead) return
  saving.value = true
  try {
    const fields: Record<string, string> = {}
    for (const key in formValues) fields[key] = formValues[key]!.trim()

    await updateFields(props.lead.id, fields)
    const target = leadsStore.leads.find((l) => String(l.id) === String(props.lead!.id))
    if (target) Object.assign(target, fields)
    toast.add({ title: "O'zgarishlar saqlandi", color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (e: any) {
    toast.add({ title: `Xatolik: ${e?.message || 'Saqlashda xatolik'}`, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal :open="props.open" :title="`Tahrirlash — ${props.lead?.full_name || `Talaba #${props.lead?.id}`}`" @update:open="emit('update:open', $event)">
    <template #body>
      <div v-if="props.lead" class="space-y-6">
        <div v-for="group in EDIT_GROUPS" :key="group.section">
          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2.5">{{ group.section }}</p>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="field in group.fields" :key="field.key" :class="{ 'col-span-2': field.fullSpan }">
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">{{ field.label }}</label>
              <USelect
                v-if="field.type === 'select'"
                v-model="formValues[field.key as string]"
                :items="field.options!.map(([value, label]) => ({ value, label }))"
                value-key="value"
                label-key="label"
                class="w-full"
              />
              <UTextarea
                v-else-if="field.type === 'textarea'"
                v-model="formValues[field.key as string]"
                class="w-full"
                :rows="3"
              />
              <UInput
                v-else
                v-model="formValues[field.key as string]"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">Bekor qilish</UButton>
        <UiLoadingButton color="primary" :loading="saving" @click="handleSave">Saqlash</UiLoadingButton>
      </div>
    </template>
  </UModal>
</template>
