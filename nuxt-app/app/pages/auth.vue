<script setup lang="ts">
definePageMeta({ layout: 'default', middleware: 'guest' })

const authStore = useAuthStore()
const { login, signup } = useAuthService()
const route = useRoute()

const tab = ref<'login' | 'signup'>('login')

const loginForm = reactive({ identifier: '', password: '' })
const signupForm = reactive({ username: '', email: '', password: '', confirmPassword: '' })

const loginError = ref('')
const signupError = ref('')
const loginLoading = ref(false)
const signupLoading = ref(false)
const signupSuccess = ref(false)

const pwScore = computed(() => {
  const val = signupForm.password
  if (!val) return 0
  let score = 0
  if (val.length >= 8) score++
  if (/[A-Z]/.test(val) || /[0-9]/.test(val)) score++
  if (/[!@#$%^&*]/.test(val) && val.length >= 10) score++
  return score
})
const pwLabel = computed(() => (pwScore.value <= 1 ? 'Weak' : pwScore.value === 2 ? 'Medium' : 'Strong'))
const pwColor = computed(() => (pwScore.value <= 1 ? 'bg-danger-500' : pwScore.value === 2 ? 'bg-warning-500' : 'bg-success-500'))

const showLoginPassword = ref(false)
const showSignupPassword = ref(false)
const showSignupConfirm = ref(false)

async function handleLogin() {
  loginError.value = ''
  if (!loginForm.identifier || !loginForm.password) {
    loginError.value = 'Please fill in all fields.'
    return
  }
  loginLoading.value = true
  try {
    const data = await login({ email: loginForm.identifier, password: loginForm.password })
    authStore.setSession(data.token, data.user)
    await navigateTo(String(route.query.redirect || '/cabinet'))
  } catch (e: any) {
    loginError.value = apiErrorMessage(e, 'Login failed.')
  } finally {
    loginLoading.value = false
  }
}

async function handleSignup() {
  signupError.value = ''
  const { username, email, password, confirmPassword } = signupForm
  if (!username || !email || !password || !confirmPassword) {
    signupError.value = 'Please fill in all fields.'
    return
  }
  if (password !== confirmPassword) {
    signupError.value = 'Passwords do not match.'
    return
  }
  if (password.length < 6) {
    signupError.value = 'Password must be at least 6 characters.'
    return
  }

  signupLoading.value = true
  try {
    const data = await signup({ username, email, password, confirmPassword })
    authStore.setSession(data.token, data.user)
    signupSuccess.value = true
    setTimeout(() => navigateTo('/cabinet'), 900)
  } catch (e: any) {
    signupError.value = apiErrorMessage(e, 'Signup failed.')
  } finally {
    signupLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <img src="/logo.png" alt="SalomKorea" class="h-12 w-12 rounded-xl object-contain mb-3">
        <h1 class="text-xl font-semibold text-[var(--color-text-primary)] dark:text-white tracking-tight">SalomKorea Cabinet</h1>
      </div>

      <UCard :ui="{ body: 'p-6 sm:p-8' }">
        <div class="grid grid-cols-2 gap-1 p-1 rounded-md bg-primary-50 dark:bg-white/5 mb-6">
          <button
            type="button"
            class="rounded-sm py-2 text-sm font-semibold transition-colors"
            :class="tab === 'login' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
            @click="tab = 'login'"
          >
            Sign in
          </button>
          <button
            type="button"
            class="rounded-sm py-2 text-sm font-semibold transition-colors"
            :class="tab === 'signup' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
            @click="tab = 'signup'"
          >
            Create account
          </button>
        </div>

        <form v-if="tab === 'login'" class="space-y-4" @submit.prevent="handleLogin">
          <UFormField label="Email or Consulting Name">
            <UInput v-model="loginForm.identifier" type="text" placeholder="Enter email or consulting name" icon="i-lucide-mail" size="lg" class="w-full" autocomplete="username" />
          </UFormField>
          <UFormField label="Password">
            <UInput
              v-model="loginForm.password"
              :type="showLoginPassword ? 'text' : 'password'"
              placeholder="••••••••"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              autocomplete="current-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white transition-colors"
                  :aria-label="showLoginPassword ? 'Hide password' : 'Show password'"
                  @click="showLoginPassword = !showLoginPassword"
                >
                  <UIcon :name="showLoginPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4.5" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UAlert v-if="loginError" color="error" variant="soft" :title="loginError" />

          <UiLoadingButton type="submit" block size="lg" :loading="loginLoading" color="primary">
            Sign in
          </UiLoadingButton>
        </form>

        <form v-else class="space-y-4" @submit.prevent="handleSignup">
          <UFormField label="Consulting name">
            <UInput v-model="signupForm.username" placeholder="Your company / name" icon="i-lucide-building" size="lg" class="w-full" />
          </UFormField>
          <UFormField label="Email">
            <UInput v-model="signupForm.email" type="email" placeholder="you@example.com" icon="i-lucide-mail" size="lg" class="w-full" autocomplete="email" />
          </UFormField>
          <UFormField label="Password">
            <UInput
              v-model="signupForm.password"
              :type="showSignupPassword ? 'text' : 'password'"
              placeholder="••••••••"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              autocomplete="new-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white transition-colors"
                  :aria-label="showSignupPassword ? 'Hide password' : 'Show password'"
                  @click="showSignupPassword = !showSignupPassword"
                >
                  <UIcon :name="showSignupPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4.5" />
                </button>
              </template>
            </UInput>
            <div v-if="signupForm.password" class="mt-2 flex items-center gap-2">
              <div class="flex-1 flex gap-1">
                <span v-for="i in 3" :key="i" class="h-1 flex-1 rounded-full bg-neutral-200 dark:bg-white/10" :class="{ [pwColor]: i <= pwScore || (pwScore === 0 && i === 1) }" />
              </div>
              <span class="text-xs font-medium text-[var(--color-text-secondary)]">{{ pwLabel }}</span>
            </div>
          </UFormField>
          <UFormField label="Confirm password">
            <UInput
              v-model="signupForm.confirmPassword"
              :type="showSignupConfirm ? 'text' : 'password'"
              placeholder="••••••••"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              autocomplete="new-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white transition-colors"
                  :aria-label="showSignupConfirm ? 'Hide password' : 'Show password'"
                  @click="showSignupConfirm = !showSignupConfirm"
                >
                  <UIcon :name="showSignupConfirm ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4.5" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UAlert v-if="signupError" color="error" variant="soft" :title="signupError" />
          <UAlert v-if="signupSuccess" color="success" variant="soft" title="Account created! Redirecting…" />

          <UiLoadingButton type="submit" block size="lg" :loading="signupLoading" color="primary">
            Create account
          </UiLoadingButton>
        </form>
      </UCard>
    </div>
  </div>
</template>
