<script setup lang="ts">
const { apiFetch } = useApiFetch()
const toast = useToast()

interface University {
  id: number
  name: string
  location: string
  notes: string
}

const items = ref<University[]>([])
const searchQuery = ref('')
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)

const showModal = ref(false)
const editingItem = ref<University | null>(null)
const form = ref({ name: '', location: '', notes: '' })
const formError = ref('')

const confirmDeleteId = ref<number | null>(null)
const confirmDeleteName = ref('')
const showDeleteConfirm = ref(false)

const filteredItems = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return items.value
  return items.value.filter(u =>
    u.name.toLowerCase().includes(q)
    || (u.location || '').toLowerCase().includes(q)
  )
})

async function load() {
  loading.value = true
  try {
    const data = await apiFetch<University[]>('/api/settings/universities')
    items.value = data || []
  } catch {
    toast.add({ title: 'Failed to load universities', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingItem.value = null
  form.value = { name: '', location: '', notes: '' }
  formError.value = ''
  showModal.value = true
}

function openEdit(item: University) {
  editingItem.value = item
  form.value = { name: item.name, location: item.location || '', notes: item.notes || '' }
  formError.value = ''
  showModal.value = true
}

async function save() {
  formError.value = ''
  if (!form.value.name.trim()) {
    formError.value = 'University name is required.'
    return
  }
  saving.value = true
  try {
    if (editingItem.value) {
      await apiFetch('/api/settings/universities?action=update', {
        method: 'POST',
        body: { id: editingItem.value.id, ...form.value }
      })
      const idx = items.value.findIndex(u => u.id === editingItem.value!.id)
      if (idx !== -1) items.value[idx] = { ...items.value[idx]!, ...form.value }
      toast.add({ title: 'University updated', color: 'success' })
    } else {
      const res = await apiFetch<{ id: number }>('/api/settings/universities?action=create', {
        method: 'POST',
        body: form.value
      })
      items.value.push({ id: res.id, ...form.value })
      items.value.sort((a, b) => a.name.localeCompare(b.name))
      toast.add({ title: 'University added', color: 'success' })
    }
    showModal.value = false
  } catch (e: unknown) {
    formError.value = apiErrorMessage(e, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

function promptDelete(item: University) {
  confirmDeleteId.value = item.id
  confirmDeleteName.value = item.name
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  deleting.value = true
  try {
    await apiFetch('/api/settings/universities?action=delete', {
      method: 'POST',
      body: { id: confirmDeleteId.value }
    })
    items.value = items.value.filter(u => u.id !== confirmDeleteId.value)
    toast.add({ title: 'University deleted', color: 'success' })
    showDeleteConfirm.value = false
  } catch (e: unknown) {
    toast.add({ title: apiErrorMessage(e, 'Failed to delete.'), color: 'error' })
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-lg font-semibold text-[var(--color-text-primary)] dark:text-white">
          Universities
        </h2>
        <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Manage your university list independently
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        @click="openAdd"
      >
        Add University
      </UButton>
    </div>

    <!-- Search -->
    <UInput
      v-model="searchQuery"
      icon="i-lucide-search"
      placeholder="Search universities..."
      class="max-w-sm"
    />

    <!-- Table -->
    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-white/[0.03]">
      <div
        v-if="loading"
        class="p-8 flex items-center justify-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 text-[var(--color-text-secondary)] animate-spin"
        />
      </div>
      <div
        v-else-if="filteredItems.length === 0"
        class="p-8 text-center text-sm text-[var(--color-text-secondary)]"
      >
        {{ searchQuery ? 'No universities found matching your search.' : 'No universities yet. Click "Add University" to get started.' }}
      </div>
      <table
        v-else
        class="w-full"
      >
        <thead>
          <tr class="border-b border-[var(--color-border)] dark:border-white/[0.08]">
            <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
              University Name
            </th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">
              Location
            </th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.05]">
          <tr
            v-for="item in filteredItems"
            :key="item.id"
            class="hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <td class="px-4 py-3">
              <div class="font-medium text-sm text-[var(--color-text-primary)] dark:text-white">
                {{ item.name }}
              </div>
              <div
                v-if="item.notes"
                class="text-xs text-[var(--color-text-secondary)] mt-0.5"
              >
                {{ item.notes }}
              </div>
            </td>
            <td class="px-4 py-3 text-sm text-[var(--color-text-secondary)] hidden sm:table-cell">
              {{ item.location || '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 justify-end">
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  @click="openEdit(item)"
                >
                  Edit
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  @click="promptDelete(item)"
                >
                  Delete
                </UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :title="editingItem ? 'Edit University' : 'Add University'"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField
            label="University Name"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="e.g. Seoul National University"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField label="Location">
            <UInput
              v-model="form.location"
              placeholder="e.g. Seoul, Korea"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Notes">
            <UInput
              v-model="form.notes"
              placeholder="Optional notes"
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            :title="formError"
          />
          <div class="flex gap-2 justify-end pt-1">
            <UButton
              variant="ghost"
              color="neutral"
              @click="showModal = false"
            >
              Cancel
            </UButton>
            <UiLoadingButton
              type="submit"
              :loading="saving"
              color="primary"
            >
              {{ editingItem ? 'Save Changes' : 'Add University' }}
            </UiLoadingButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal
      v-model:open="showDeleteConfirm"
      title="Delete University?"
    >
      <template #body>
        <p class="text-sm text-[var(--color-text-secondary)]">
          Are you sure you want to delete
          <strong class="text-[var(--color-text-primary)] dark:text-white">{{ confirmDeleteName }}</strong>?
          This action cannot be undone.
        </p>
        <div class="flex gap-2 justify-end mt-5">
          <UButton
            variant="ghost"
            color="neutral"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </UButton>
          <UiLoadingButton
            :loading="deleting"
            color="error"
            @click="confirmDelete"
          >
            Delete
          </UiLoadingButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
