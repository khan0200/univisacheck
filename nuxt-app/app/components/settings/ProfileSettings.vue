<script setup lang="ts">
const authStore = useAuthStore()
const { updateProfile, changePassword } = useAuthService()
const toast = useToast()

const tab = ref<'general' | 'security'>('general')
const username = ref(authStore.user?.username || '')
const generalSaving = ref(false)
const generalError = ref('')

const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')

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
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-[var(--color-text-primary)] dark:text-white">Profile Settings</h2>
      <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">Manage your account name and password</p>
    </div>

    <!-- Tab switcher -->
    <div class="grid grid-cols-2 gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-white/5 w-full sm:max-w-xs">
      <button
        type="button"
        class="rounded-md py-2 text-sm font-semibold transition-colors"
        :class="tab === 'general' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
        @click="tab = 'general'"
      >
        General
      </button>
      <button
        type="button"
        class="rounded-md py-2 text-sm font-semibold transition-colors"
        :class="tab === 'security' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
        @click="tab = 'security'"
      >
        Security
      </button>
    </div>

    <!-- General Tab -->
    <div
      v-if="tab === 'general'"
      class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6 max-w-lg"
    >
      <form class="space-y-4" @submit.prevent="saveGeneral">
        <div class="flex items-center gap-4 mb-6">
          <div class="flex items-center justify-center size-14 rounded-full bg-primary-900 text-secondary-300 text-xl font-bold shrink-0">
            {{ (authStore.user?.username || authStore.user?.email || 'U').charAt(0).toUpperCase() }}
          </div>
          <div>
            <div class="font-semibold text-[var(--color-text-primary)] dark:text-white">{{ authStore.user?.username || '—' }}</div>
            <div class="text-sm text-[var(--color-text-secondary)]">{{ authStore.user?.email }}</div>
          </div>
        </div>
        <UFormField label="Consulting Name">
          <UInput v-model="username" placeholder="Enter consulting name" required class="w-full" />
        </UFormField>
        <UAlert v-if="generalError" color="error" variant="soft" :title="generalError" />
        <UiLoadingButton type="submit" :loading="generalSaving" color="primary" class="w-full sm:w-auto">
          Save Changes
        </UiLoadingButton>
      </form>
    </div>

    <!-- Security Tab -->
    <div
      v-else
      class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6 max-w-lg"
    >
      <form class="space-y-4" @submit.prevent="savePassword">
        <UFormField label="New Password">
          <UInput v-model="newPassword" type="password" placeholder="Minimum 6 characters" required class="w-full" />
        </UFormField>
        <UFormField label="Confirm New Password">
          <UInput v-model="confirmPassword" type="password" placeholder="••••••••" required class="w-full" />
        </UFormField>
        <UAlert v-if="passwordError" color="error" variant="soft" :title="passwordError" />
        <UiLoadingButton type="submit" :loading="passwordSaving" color="primary" class="w-full sm:w-auto">
          Change Password
        </UiLoadingButton>
      </form>
    </div>
  </div>
</template>
