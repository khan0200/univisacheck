<script setup lang="ts">
const emit = defineEmits<{ unlocked: [] }>()

const leadsAdmin = useLeadsAdminStore()
const { fetchLeads } = useLeadsService()

const password = ref('')
const loading = ref(false)
const error = ref('')

async function attemptLogin() {
  const value = password.value.trim()
  if (!value) return
  loading.value = true
  error.value = ''
  leadsAdmin.setSecret(value)
  try {
    await fetchLeads()
    emit('unlocked')
  } catch {
    error.value = 'Parol noto\'g\'ri. Qaytadan urinib ko\'ring.'
    leadsAdmin.clearSecret()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="flex flex-col items-center mb-6">
        <div class="flex items-center justify-center size-12 rounded-2xl bg-primary-900 text-secondary-300 mb-3">
          <UIcon
            name="i-lucide-lock"
            class="size-6"
          />
        </div>
        <h1 class="text-lg font-semibold text-[var(--color-text-primary)] dark:text-white">
          Leads Dashboard
        </h1>
        <p class="text-sm text-[var(--color-text-secondary)] mt-1">
          Admin parolini kiriting
        </p>
      </div>

      <UCard :ui="{ body: 'p-6' }">
        <form
          class="space-y-4"
          @submit.prevent="attemptLogin"
        >
          <UInput
            v-model="password"
            type="password"
            placeholder="Admin parol"
            icon="i-lucide-key"
            size="lg"
            class="w-full"
            autofocus
          />
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="error"
          />
          <UiLoadingButton
            type="submit"
            block
            size="lg"
            color="primary"
            :loading="loading"
          >
            Kirish
          </UiLoadingButton>
        </form>
      </UCard>
    </div>
  </div>
</template>
