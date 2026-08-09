<script setup lang="ts">
const { apiFetch } = useApiFetch()
const toast = useToast()

interface Tariff {
  id: number
  name: string
  price: string
  currency: string
  description: string
}

const items = ref<Tariff[]>([])
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)

const showModal = ref(false)
const editingItem = ref<Tariff | null>(null)
const form = ref({ name: '', price: '', currency: 'USD', description: '' })
const formError = ref('')

const confirmDeleteId = ref<number | null>(null)
const confirmDeleteName = ref('')
const showDeleteConfirm = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await apiFetch<Tariff[]>('/api/settings/tariffs')
    items.value = data || []
  } catch {
    toast.add({ title: 'Failed to load tariffs', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingItem.value = null
  form.value = { name: '', price: '', currency: 'USD', description: '' }
  formError.value = ''
  showModal.value = true
}

function openEdit(item: Tariff) {
  editingItem.value = item
  form.value = { name: item.name, price: item.price || '', currency: item.currency || 'USD', description: item.description || '' }
  formError.value = ''
  showModal.value = true
}

async function save() {
  formError.value = ''
  if (!form.value.name.trim()) {
    formError.value = 'Tariff name is required.'
    return
  }
  saving.value = true
  try {
    if (editingItem.value) {
      await apiFetch('/api/settings/tariffs?action=update', {
        method: 'POST',
        body: { id: editingItem.value.id, ...form.value }
      })
      const idx = items.value.findIndex(t => t.id === editingItem.value!.id)
      if (idx !== -1) items.value[idx] = { ...items.value[idx]!, ...form.value }
      toast.add({ title: 'Tariff updated', color: 'success' })
    } else {
      const res = await apiFetch<{ id: number }>('/api/settings/tariffs?action=create', {
        method: 'POST',
        body: form.value
      })
      items.value.push({ id: res.id, ...form.value })
      items.value.sort((a, b) => a.name.localeCompare(b.name))
      toast.add({ title: 'Tariff added', color: 'success' })
    }
    showModal.value = false
  } catch (e: any) {
    formError.value = apiErrorMessage(e, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

function promptDelete(item: Tariff) {
  confirmDeleteId.value = item.id
  confirmDeleteName.value = item.name
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  deleting.value = true
  try {
    await apiFetch('/api/settings/tariffs?action=delete', {
      method: 'POST',
      body: { id: confirmDeleteId.value }
    })
    items.value = items.value.filter(t => t.id !== confirmDeleteId.value)
    toast.add({ title: 'Tariff deleted', color: 'success' })
    showDeleteConfirm.value = false
  } catch (e: any) {
    toast.add({ title: apiErrorMessage(e, 'Failed to delete.'), color: 'error' })
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-lg font-semibold text-[var(--color-text-primary)] dark:text-white">Tariff</h2>
        <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">Manage your pricing tariffs independently</p>
      </div>
      <UButton icon="i-lucide-plus" color="primary" @click="openAdd">Add Tariff</UButton>
    </div>

    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-white/[0.03]">
      <div v-if="loading" class="p-8 flex items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-6 text-[var(--color-text-secondary)] animate-spin" />
      </div>
      <div v-else-if="items.length === 0" class="p-8 text-center text-sm text-[var(--color-text-secondary)]">
        No tariffs yet. Click "Add Tariff" to get started.
      </div>
      <table v-else class="w-full">
        <thead>
          <tr class="border-b border-[var(--color-border)] dark:border-white/[0.08]">
            <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Tariff Name</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">Price</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide hidden md:table-cell">Description</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.05]">
          <tr
            v-for="item in items"
            :key="item.id"
            class="hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <td class="px-4 py-3 font-medium text-sm text-[var(--color-text-primary)] dark:text-white">{{ item.name }}</td>
            <td class="px-4 py-3 text-sm text-[var(--color-text-secondary)] hidden sm:table-cell">
              <span v-if="item.price">{{ item.price }} {{ item.currency }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-sm text-[var(--color-text-secondary)] hidden md:table-cell max-w-xs truncate">{{ item.description || '—' }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 justify-end">
                <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(item)">Edit</UButton>
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="promptDelete(item)">Delete</UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <UModal v-model:open="showModal" :title="editingItem ? 'Edit Tariff' : 'Add Tariff'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Tariff Name" required>
            <UInput v-model="form.name" placeholder="e.g. Standard Package" class="w-full" required />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Price">
              <UInput v-model="form.price" placeholder="e.g. 500" class="w-full" />
            </UFormField>
            <UFormField label="Currency">
              <UInput v-model="form.currency" placeholder="USD" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Description">
            <UInput v-model="form.description" placeholder="Optional description" class="w-full" />
          </UFormField>
          <UAlert v-if="formError" color="error" variant="soft" :title="formError" />
          <div class="flex gap-2 justify-end pt-1">
            <UButton variant="ghost" color="neutral" @click="showModal = false">Cancel</UButton>
            <UiLoadingButton type="submit" :loading="saving" color="primary">
              {{ editingItem ? 'Save Changes' : 'Add Tariff' }}
            </UiLoadingButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal v-model:open="showDeleteConfirm" title="Delete Tariff?">
      <template #body>
        <p class="text-sm text-[var(--color-text-secondary)]">
          Are you sure you want to delete <strong class="text-[var(--color-text-primary)] dark:text-white">{{ confirmDeleteName }}</strong>?
          This action cannot be undone.
        </p>
        <div class="flex gap-2 justify-end mt-5">
          <UButton variant="ghost" color="neutral" @click="showDeleteConfirm = false">Cancel</UButton>
          <UiLoadingButton :loading="deleting" color="error" @click="confirmDelete">Delete</UiLoadingButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
