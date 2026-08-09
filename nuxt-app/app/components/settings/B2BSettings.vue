<script setup lang="ts">
const { apiFetch } = useApiFetch()
const toast = useToast()

interface B2BPartner {
  id: number
  name: string
}

const items = ref<B2BPartner[]>([])
const searchQuery = ref('')
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)

const showModal = ref(false)
const editingItem = ref<B2BPartner | null>(null)
const form = ref({ name: '' })
const formError = ref('')

const confirmDeleteId = ref<number | null>(null)
const confirmDeleteName = ref('')
const showDeleteConfirm = ref(false)

const filteredItems = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return items.value
  return items.value.filter(b =>
    b.name.toLowerCase().includes(q)
  )
})

async function load() {
  loading.value = true
  try {
    const data = await apiFetch<B2BPartner[]>('/api/settings/b2b')
    items.value = data || []
  } catch {
    toast.add({ title: 'Failed to load B2B partners', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingItem.value = null
  form.value = { name: '' }
  formError.value = ''
  showModal.value = true
}

function openEdit(item: B2BPartner) {
  editingItem.value = item
  form.value = { name: item.name }
  formError.value = ''
  showModal.value = true
}

async function save() {
  formError.value = ''
  if (!form.value.name.trim()) {
    formError.value = 'B2B partner name is required.'
    return
  }
  saving.value = true
  try {
    if (editingItem.value) {
      await apiFetch('/api/settings/b2b?action=update', {
        method: 'POST',
        body: { id: editingItem.value.id, ...form.value }
      })
      const idx = items.value.findIndex(b => b.id === editingItem.value!.id)
      if (idx !== -1) items.value[idx] = { ...items.value[idx]!, ...form.value }
      toast.add({ title: 'B2B partner updated', color: 'success' })
    } else {
      const res = await apiFetch<{ id: number }>('/api/settings/b2b?action=create', {
        method: 'POST',
        body: form.value
      })
      items.value.push({ id: res.id, ...form.value })
      items.value.sort((a, b) => a.name.localeCompare(b.name))
      toast.add({ title: 'B2B partner added', color: 'success' })
    }
    showModal.value = false
  } catch (e: unknown) {
    formError.value = apiErrorMessage(e, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

function promptDelete(item: B2BPartner) {
  confirmDeleteId.value = item.id
  confirmDeleteName.value = item.name
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  deleting.value = true
  try {
    await apiFetch('/api/settings/b2b?action=delete', {
      method: 'POST',
      body: { id: confirmDeleteId.value }
    })
    items.value = items.value.filter(b => b.id !== confirmDeleteId.value)
    toast.add({ title: 'B2B partner deleted', color: 'success' })
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
          B2B Partners
        </h2>
        <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
          Manage your B2B partners for student tracking
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        @click="openAdd"
      >
        Add B2B
      </UButton>
    </div>

    <!-- Search -->
    <UInput
      v-model="searchQuery"
      icon="i-lucide-search"
      placeholder="Search B2B partners..."
      class="max-w-sm"
    />

    <!-- Grid -->
    <div
      v-if="loading"
      class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-8 flex items-center justify-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 text-[var(--color-text-secondary)] animate-spin"
      />
    </div>
    <div
      v-else-if="filteredItems.length === 0"
      class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-8 text-center text-sm text-[var(--color-text-secondary)]"
    >
      {{ searchQuery ? 'No B2B partners found matching your search.' : 'No B2B partners yet. Click "Add B2B" to get started.' }}
    </div>
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors"
      >
        <span class="font-medium text-sm text-[var(--color-text-primary)] dark:text-white truncate pr-4">
          {{ item.name }}
        </span>
        <div class="flex items-center gap-1.5 shrink-0">
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-pencil"
            class="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
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
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :title="editingItem ? 'Edit B2B' : 'Add B2B'"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField
            label="B2B Name"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="e.g. Seoul Study"
              required
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
              {{ editingItem ? 'Save Changes' : 'Add B2B' }}
            </UiLoadingButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal
      v-model:open="showDeleteConfirm"
      title="Delete B2B Partner?"
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
