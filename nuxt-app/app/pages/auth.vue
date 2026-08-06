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
  <div class="auth-page">
    <!-- Left branded hero panel — hidden on mobile -->
    <div class="auth-hero">
      <div class="auth-hero-overlay" />
      <div class="auth-hero-content">
        <img src="/logo.png" alt="SalomKorea" class="auth-hero-logo">
        <h2 class="auth-hero-title">SalomKorea</h2>
        <p class="auth-hero-subtitle">Your trusted partner for Korean visa consulting & education services</p>
        <div class="auth-hero-features">
          <div class="auth-hero-feature">
            <UIcon name="i-lucide-shield-check" class="size-5 text-emerald-300" />
            <span>Real-time visa tracking</span>
          </div>
          <div class="auth-hero-feature">
            <UIcon name="i-lucide-landmark" class="size-5 text-emerald-300" />
            <span>Embassy visa tracking</span>
          </div>
          <div class="auth-hero-feature">
            <UIcon name="i-lucide-globe" class="size-5 text-emerald-300" />
            <span>E-Visa tracking</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right form panel -->
    <div class="auth-form-panel">
      <div class="auth-form-wrapper">
        <!-- Mobile-only logo -->
        <div class="auth-mobile-header">
          <img src="/logo.png" alt="SalomKorea" class="h-11 w-11 rounded-xl object-contain">
          <h1 class="text-lg font-bold text-[var(--color-text-primary)] dark:text-white tracking-tight">SalomKorea</h1>
        </div>

        <!-- Heading -->
        <div class="auth-heading">
          <h1 class="auth-title">{{ tab === 'login' ? 'Welcome back' : 'Get started' }}</h1>
          <p class="auth-description">{{ tab === 'login' ? 'Sign in to your consultant cabinet' : 'Create your consultant account' }}</p>
        </div>

        <!-- Tab switcher -->
        <div class="auth-tabs">
          <button
            type="button"
            class="auth-tab"
            :class="tab === 'login' ? 'auth-tab-active' : 'auth-tab-inactive'"
            @click="tab = 'login'"
          >
            <UIcon name="i-lucide-log-in" class="size-4" />
            Sign in
          </button>
          <button
            type="button"
            class="auth-tab"
            :class="tab === 'signup' ? 'auth-tab-active' : 'auth-tab-inactive'"
            @click="tab = 'signup'"
          >
            <UIcon name="i-lucide-user-plus" class="size-4" />
            Create account
          </button>
        </div>

        <!-- Login form -->
        <form v-if="tab === 'login'" class="auth-form" @submit.prevent="handleLogin">
          <UFormField label="Email or Consulting Name">
            <UInput
              v-model="loginForm.identifier"
              type="text"
              placeholder="Enter email or consulting name"
              icon="i-lucide-mail"
              size="xl"
              class="w-full auth-input"
              autocomplete="username"
            />
          </UFormField>
          <UFormField label="Password">
            <UInput
              v-model="loginForm.password"
              :type="showLoginPassword ? 'text' : 'password'"
              placeholder="Enter your password"
              icon="i-lucide-lock"
              size="xl"
              class="w-full auth-input"
              autocomplete="current-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showLoginPassword ? 'Hide password' : 'Show password'"
                  @click="showLoginPassword = !showLoginPassword"
                >
                  <UIcon :name="showLoginPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-5" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UAlert v-if="loginError" color="error" variant="soft" :title="loginError" icon="i-lucide-alert-circle" class="auth-alert" />

          <UiLoadingButton type="submit" block size="xl" :loading="loginLoading" color="primary" class="auth-submit-btn">
            Sign in
          </UiLoadingButton>
        </form>

        <!-- Signup form -->
        <form v-else class="auth-form" @submit.prevent="handleSignup">
          <UFormField label="Consulting name">
            <UInput
              v-model="signupForm.username"
              placeholder="Your company or name"
              icon="i-lucide-building"
              size="xl"
              class="w-full auth-input"
            />
          </UFormField>
          <UFormField label="Email">
            <UInput
              v-model="signupForm.email"
              type="email"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="xl"
              class="w-full auth-input"
              autocomplete="email"
            />
          </UFormField>
          <UFormField label="Password">
            <UInput
              v-model="signupForm.password"
              :type="showSignupPassword ? 'text' : 'password'"
              placeholder="Create a strong password"
              icon="i-lucide-lock"
              size="xl"
              class="w-full auth-input"
              autocomplete="new-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showSignupPassword ? 'Hide password' : 'Show password'"
                  @click="showSignupPassword = !showSignupPassword"
                >
                  <UIcon :name="showSignupPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-5" />
                </button>
              </template>
            </UInput>
            <div v-if="signupForm.password" class="mt-2.5 flex items-center gap-2.5">
              <div class="flex-1 flex gap-1">
                <span v-for="i in 3" :key="i" class="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-white/10 transition-colors duration-300" :class="{ [pwColor]: i <= pwScore || (pwScore === 0 && i === 1) }" />
              </div>
              <span class="text-xs font-semibold text-[var(--color-text-secondary)]">{{ pwLabel }}</span>
            </div>
          </UFormField>
          <UFormField label="Confirm password">
            <UInput
              v-model="signupForm.confirmPassword"
              :type="showSignupConfirm ? 'text' : 'password'"
              placeholder="Re-enter your password"
              icon="i-lucide-lock"
              size="xl"
              class="w-full auth-input"
              autocomplete="new-password"
            >
              <template #trailing>
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showSignupConfirm ? 'Hide password' : 'Show password'"
                  @click="showSignupConfirm = !showSignupConfirm"
                >
                  <UIcon :name="showSignupConfirm ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-5" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UAlert v-if="signupError" color="error" variant="soft" :title="signupError" icon="i-lucide-alert-circle" class="auth-alert" />
          <UAlert v-if="signupSuccess" color="success" variant="soft" title="Account created! Redirecting…" icon="i-lucide-check-circle" class="auth-alert" />

          <UiLoadingButton type="submit" block size="xl" :loading="signupLoading" color="primary" class="auth-submit-btn">
            Create account
          </UiLoadingButton>
        </form>

        <!-- Footer -->
        <p class="auth-footer">
          © {{ new Date().getFullYear() }} SalomKorea. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page layout ── */
.auth-page {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
}

/* ── Left hero panel ── */
.auth-hero {
  display: none;
  position: relative;
  flex: 1;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-primary-900) 0%, var(--color-primary-700) 40%, var(--color-primary-500) 100%);
}

.auth-hero-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 80%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(245, 224, 119, 0.1) 0%, transparent 50%);
  pointer-events: none;
}

.auth-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem;
  height: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.auth-hero-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: contain;
  margin-bottom: 1.5rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.auth-hero-title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
}

.auth-hero-subtitle {
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.6;
  margin-bottom: 2.5rem;
}

.auth-hero-features {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-hero-feature {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

/* ── Right form panel ── */
.auth-form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  background: var(--color-bg);
  min-height: 100vh;
  min-height: 100dvh;
}

:root[data-theme='dark'] .auth-form-panel,
.dark .auth-form-panel {
  background: var(--color-bg-dark);
}

.auth-form-wrapper {
  width: 100%;
  max-width: 440px;
}

/* ── Mobile header ── */
.auth-mobile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

/* ── Headings ── */
.auth-heading {
  margin-bottom: 1.75rem;
}

.auth-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}

.dark .auth-title {
  color: #fff;
}

.auth-description {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* ── Tab switcher ── */
.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.375rem;
  padding: 0.375rem;
  border-radius: 14px;
  background: var(--color-primary-50);
  margin-bottom: 2rem;
}

.dark .auth-tabs {
  background: rgba(255, 255, 255, 0.05);
}

.auth-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
  border: none;
  outline: none;
}

.auth-tab-active {
  background: #fff;
  color: var(--color-primary-800);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.dark .auth-tab-active {
  background: var(--color-primary-900);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.auth-tab-inactive {
  background: transparent;
  color: var(--color-text-secondary);
}

.auth-tab-inactive:hover {
  color: var(--color-text-primary);
  background: rgba(0, 0, 0, 0.03);
}

.dark .auth-tab-inactive:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

/* ── Form ── */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Input overrides for taller, more spacious inputs ── */
.auth-input :deep(input) {
  padding-top: 0.875rem;
  padding-bottom: 0.875rem;
  font-size: 0.9375rem;
}

/* ── Eye toggle button ── */
.auth-eye-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: color 0.15s ease;
  padding: 0.25rem;
  border-radius: 6px;
}

.auth-eye-btn:hover {
  color: var(--color-text-primary);
}

.dark .auth-eye-btn:hover {
  color: #fff;
}

/* ── Submit button ── */
.auth-submit-btn {
  margin-top: 0.5rem;
  font-weight: 600 !important;
  letter-spacing: 0.01em;
}

.auth-submit-btn :deep(button) {
  padding-top: 0.875rem;
  padding-bottom: 0.875rem;
}

/* ── Alert ── */
.auth-alert {
  border-radius: 12px;
}

/* ── Footer ── */
.auth-footer {
  margin-top: 2.5rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* ── Responsive — show hero panel on lg+ ── */
@media (min-width: 1024px) {
  .auth-hero {
    display: block;
  }

  .auth-mobile-header {
    display: none;
  }

  .auth-form-panel {
    flex: 0 0 50%;
    max-width: 50%;
  }
}

@media (min-width: 1280px) {
  .auth-form-panel {
    flex: 0 0 44%;
    max-width: 44%;
  }
}
</style>
