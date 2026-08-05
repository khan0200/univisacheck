<script setup lang="ts">
import type { Lead } from '~/types/lead'
import { exportLeadsCsv } from '~/utils/lead-format'

definePageMeta({ layout: 'default', middleware: 'leads-admin' })
useSeoMeta({ title: 'Leads Dashboard' })

const leadsAdmin = useLeadsAdminStore()
const leadsStore = useLeadsStore()
const toast = useToast()

const unlocked = ref(false)
const refreshing = ref(false)

onMounted(async () => {
  if (leadsAdmin.secret) {
    try {
      await leadsStore.load()
      unlocked.value = true
    } catch {
      leadsAdmin.clearSecret()
    }
  }
})

async function handleUnlocked() {
  unlocked.value = true
  await leadsStore.load()
}

async function handleRefresh() {
  refreshing.value = true
  try {
    await leadsStore.load()
  } catch (e: any) {
    if (e?.message === 'unauthorized') {
      leadsAdmin.clearSecret()
      unlocked.value = false
    } else {
      toast.add({ title: e?.message || 'Xatolik', color: 'error' })
    }
  } finally {
    refreshing.value = false
  }
}

function handleExport() {
  const rows = leadsStore.filteredLeads
  if (rows.length === 0) {
    toast.add({ title: "Eksport qilish uchun ma'lumot yo'q", color: 'warning' })
    return
  }
  exportLeadsCsv(rows)
  toast.add({ title: `${rows.length} ta yozuv eksport qilindi`, color: 'success' })
}

const detailsModalOpen = ref(false)
const detailsLead = ref<Lead | null>(null)
function openDetails(lead: Lead) {
  detailsLead.value = lead
  detailsModalOpen.value = true
}

const editModalOpen = ref(false)
const editLead = ref<Lead | null>(null)
function openEdit(lead: Lead) {
  editLead.value = lead
  editModalOpen.value = true
}

const deleteModalOpen = ref(false)
const deleteLeadTarget = ref<Lead | null>(null)
function openDelete(lead: Lead) {
  deleteLeadTarget.value = lead
  deleteModalOpen.value = true
}
</script>

<template>
  <DashboardLeadsGate v-if="!unlocked" @unlocked="handleUnlocked" />

  <div v-else class="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-[var(--color-text-primary)] dark:text-white">Leads Dashboard</h1>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" square :loading="refreshing" aria-label="Refresh" @click="handleRefresh" />
        <UButton icon="i-lucide-download" color="neutral" variant="outline" @click="handleExport">Export CSV</UButton>
      </div>
    </div>

    <DashboardLeadsStats />

    <div class="flex flex-col lg:flex-row lg:items-center gap-3">
      <DashboardLeadsFilterTabs />
      <UInput
        v-model="leadsStore.searchQuery"
        icon="i-lucide-search"
        placeholder="Ism, telefon yoki universitet bo'yicha qidirish…"
        class="w-full lg:max-w-xs lg:ml-auto"
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UiTableSkeleton v-if="leadsStore.isLoading" :cols="8" />
      <UiEmptyState
        v-else-if="leadsStore.filteredLeads.length === 0"
        icon="i-lucide-inbox"
        title="Lidlar topilmadi"
        description="Qidiruv yoki filtrni o'zgartirib ko'ring."
      />
      <DashboardLeadsTable
        v-else
        @details="openDetails"
        @edit="openEdit"
        @delete="openDelete"
      />
    </UCard>

    <div v-if="leadsStore.totalPages > 1" class="flex items-center justify-between">
      <p class="text-xs text-[var(--color-text-secondary)]">
        {{ (leadsStore.currentPage - 1) * leadsStore.PAGE_SIZE + 1 }}–{{ Math.min(leadsStore.currentPage * leadsStore.PAGE_SIZE, leadsStore.filteredLeads.length) }} / {{ leadsStore.filteredLeads.length }}
      </p>
      <UPagination
        v-model:page="leadsStore.currentPage"
        :total="leadsStore.filteredLeads.length"
        :items-per-page="leadsStore.PAGE_SIZE"
      />
    </div>

    <DashboardLeadDetailsModal v-model:open="detailsModalOpen" :lead="detailsLead" />
    <DashboardLeadEditModal v-model:open="editModalOpen" :lead="editLead" />
    <DashboardLeadDeleteModal v-model:open="deleteModalOpen" :lead="deleteLeadTarget" />
  </div>
</template>
