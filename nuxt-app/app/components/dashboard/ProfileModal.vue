<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const authStore = useAuthStore()
const { updateProfile, changePassword } = useAuthService()
const toast = useToast()

const tab = ref<'general' | 'security'>('general')
const username = ref('')
const generalSaving = ref(false)
const generalError = ref('')

const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')

watch(() => props.open, (open) => {
  if (open) {
    username.value = authStore.user?.username || ''
    tab.value = 'general'
    generalError.value = ''
    passwordError.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
})

async function saveGeneral() {
  generalError.value = ''
  const trimmed = username.value.trim()
  if (trimmed.length < 2) {
    generalError.value = 'Consulting name must be at least 2 characters.'
    return
  }
  generalSaving.value = true
  try {
    const data = await updateProfile({ username: trimmed })
    authStore.setSession(data.token, data.user)
    toast.add({ title: 'Consulting name updated successfully!', color: 'success' })
  } catch (e: any) {
    generalError.value = apiErrorMessage(e, 'Failed to update consulting name.')
  } finally {
    generalSaving.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  if (newPassword.value.length < 6) {
    passwordError.value = 'New password must be at least 6 characters.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New passwords do not match.'
    return
  }
  passwordSaving.value = true
  try {
    await changePassword({ newPassword: newPassword.value, confirmPassword: confirmPassword.value })
    newPassword.value = ''
    confirmPassword.value = ''
    toast.add({ title: 'Password updated successfully!', color: 'success' })
  } catch (e: any) {
    passwordError.value = apiErrorMessage(e, 'Failed to change password.')
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Profile Settings"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="grid grid-cols-2 gap-1 p-1 rounded-md bg-primary-50 dark:bg-white/5 mb-5">
        <button
          type="button"
          class="rounded-sm py-2 text-sm font-semibold transition-colors"
          :class="tab === 'general' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
          @click="tab = 'general'"
        >
          General
        </button>
        <button
          type="button"
          class="rounded-sm py-2 text-sm font-semibold transition-colors"
          :class="tab === 'security' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
          @click="tab = 'security'"
        >
          Security
        </button>
      </div>

      <form
        v-if="tab === 'general'"
        class="space-y-4"
        @submit.prevent="saveGeneral"
      >
        <UFormField label="Consulting Name">
          <UInput
            v-model="username"
            placeholder="Enter consulting name"
            required
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="generalError"
          color="error"
          variant="soft"
          :title="generalError"
        />
        <UiLoadingButton
          type="submit"
          block
          :loading="generalSaving"
          color="primary"
        >
          Save Changes
        </UiLoadingButton>
      </form>

      <form
        v-else
        class="space-y-4"
        @submit.prevent="savePassword"
      >
        <UFormField label="New Password">
          <UInput
            v-model="newPassword"
            type="password"
            placeholder="Minimum 6 characters"
            required
            class="w-full"
          />
        </UFormField>
        <UFormField label="Confirm New Password">
          <UInput
            v-model="confirmPassword"
            type="password"
            placeholder="••••••••"
            required
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="passwordError"
          color="error"
          variant="soft"
          :title="passwordError"
        />
        <UiLoadingButton
          type="submit"
          block
          :loading="passwordSaving"
          color="primary"
        >
          Change Password
        </UiLoadingButton>
      </form>
    </template>
  </UModal>
</template>
