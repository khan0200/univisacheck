<script setup lang="ts">
import type { Lead } from '~/types/lead'

const props = defineProps<{ open: boolean, lead: Lead | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'deleted': [] }>()

const toast = useToast()
const { deleteLead } = useLeadsService()
const leadsStore = useLeadsStore()
const deleting = ref(false)

const message = computed(() =>
  props.lead?.full_name
    ? `"${props.lead.full_name}" nomli lidni butunlay o'chirmoqchimisiz? Bu amalni orqaga qaytarib bo'lmaydi.`
    : 'Ushbu lidni butunlay o\'chirmoqchimisiz? Bu amalni orqaga qaytarib bo\'lmaydi.'
)

async function handleDelete() {
  if (!props.lead) return
  deleting.value = true
  try {
    await deleteLead(props.lead.id)
    leadsStore.leads = leadsStore.leads.filter(l => String(l.id) !== String(props.lead!.id))
    toast.add({ title: 'Lid o\'chirildi', color: 'success' })
    emit('deleted')
    emit('update:open', false)
  } catch (e: any) {
    toast.add({ title: `Xatolik: ${e?.message || 'O\'chirishda xatolik'}`, color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Lidni o'chirish"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <p class="text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {{ message }}
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
        >
          Bekor qilish
        </UButton>
        <UiLoadingButton
          color="error"
          :loading="deleting"
          @click="handleDelete"
        >
          O'chirish
        </UiLoadingButton>
      </div>
    </template>
  </UModal>
</template>
