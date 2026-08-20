<script setup lang="ts">
import type { VisaCheckApiResult, VisaCheckFormInput, VisaType } from '~/types/visa-check'
import { DATE_REGEX, PASSPORT_REGEX, formatDateInput, formatNameInput, formatPassportInput } from '~/utils/validation'

definePageMeta({ layout: 'public' })

useSeoMeta({
  title: 'Visa Status Check',
  description: 'Check your Korean visa application status instantly. Free, no signup required. Supports Embassy and E-Visa applications via visa.go.kr.'
})

const { checkStatus, cachedFallback } = useVisaCheckService()

const visaType = ref<VisaType>('Embassy')
const form = reactive({ passport: '', name: '', dob: '', appNo: '' })
const userEdited = reactive({ name: false, dob: false, appNo: false })

const submitting = ref(false)
const errorMessage = ref('')
const fieldErrors = reactive({ passport: false, name: false, dob: false, appNo: false })

const resultState = ref<'idle' | 'loading' | 'result' | 'not-found'>('idle')
const resultData = ref<VisaCheckApiResult | null>(null)
const resultCached = ref(false)
const submittedInput = ref<VisaCheckFormInput>({ passport: '', name: '', dob: '', appNo: '' })
const resultContainerRef = ref<HTMLElement | null>(null)

function scrollToResult() {
  nextTick(() => {
    if (resultContainerRef.value) {
      resultContainerRef.value.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }
  })
}

function selectType(type: VisaType) {
  visaType.value = type
  clearResult()
}

function clearResult() {
  resultState.value = 'idle'
  resultData.value = null
  resultCached.value = false
}

function clearFieldErrors() {
  errorMessage.value = ''
  fieldErrors.passport = false
  fieldErrors.name = false
  fieldErrors.dob = false
  fieldErrors.appNo = false
}

function handlePassportInput(e: Event) {
  form.passport = formatPassportInput((e.target as HTMLInputElement).value)
  userEdited.name = false
  userEdited.dob = false
  userEdited.appNo = false
  onPassportInput(form.passport)
}

function handleDobInput(e: Event) {
  form.dob = formatDateInput((e.target as HTMLInputElement).value)
  userEdited.dob = true
}

function handleNameInput(e: Event) {
  const input = e.target as HTMLInputElement
  const formatted = formatNameInput(input.value)
  form.name = formatted
  if (input.value !== formatted) {
    input.value = formatted
  }
  userEdited.name = true
}

function handleUppercase(field: 'name' | 'appNo', e: Event) {
  form[field] = (e.target as HTMLInputElement).value.toUpperCase()
  userEdited[field] = true
}

const { isLoading: autofillLoading, onPassportInput } = useVisaCheckAutofill((fields) => {
  if (fields.fullName && !userEdited.name) form.name = formatNameInput(fields.fullName)
  if (fields.birthday && !userEdited.dob) form.dob = fields.birthday
  if (fields.visaType && fields.visaType !== visaType.value) visaType.value = fields.visaType
})

function validate(): boolean {
  clearFieldErrors()
  const passport = form.passport.trim().toUpperCase()
  const name = form.name.replace(/\s+/g, ' ').trim().toUpperCase()
  form.name = name
  const dob = form.dob.trim()
  const appNo = form.appNo.trim().toUpperCase()

  if (!passport) { fieldErrors.passport = true; errorMessage.value = 'Passport number is required.'; return false }
  if (!PASSPORT_REGEX.test(passport)) { fieldErrors.passport = true; errorMessage.value = 'Passport number must be 5 to 20 letters or numbers (e.g. FA1234567 or 550873628).'; return false }
  if (!name) { fieldErrors.name = true; errorMessage.value = 'Full name is required.'; return false }
  if (!dob) { fieldErrors.dob = true; errorMessage.value = 'Date of birth is required.'; return false }
  if (!DATE_REGEX.test(dob)) { fieldErrors.dob = true; errorMessage.value = 'Date of birth must be in YYYY-MM-DD format (e.g. 1998-07-15).'; return false }
  if ((visaType.value === 'E-Visa' || visaType.value === 'Regional') && !appNo) { fieldErrors.appNo = true; errorMessage.value = 'Application number is required.'; return false }
  return true
}

async function handleSearch() {
  if (!validate()) return

  const passport = form.passport.trim().toUpperCase()
  const name = form.name.replace(/\s+/g, ' ').trim().toUpperCase()
  form.name = name
  const dob = form.dob.trim()
  const appNo = form.appNo.trim().toUpperCase()
  submittedInput.value = { passport, name, dob, appNo }

  submitting.value = true
  resultState.value = 'loading'
  scrollToResult()

  try {
    const data = await checkStatus({ passport, name, dob, visaType: visaType.value, appNo })

    if (!data.found) {
      const fallback = await cachedFallback(passport)
      if (fallback) {
        resultData.value = fallback.result
        resultCached.value = true
        resultState.value = 'result'
        scrollToResult()
        return
      }
      resultState.value = 'not-found'
      scrollToResult()
      return
    }

    resultData.value = data
    resultCached.value = false
    resultState.value = 'result'
    scrollToResult()
  } catch (e: any) {
    clearResult()
    let msg = apiErrorMessage(e, typeof e?.message === 'string' ? e.message : 'Unknown error')
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED')) {
      msg = 'Unable to reach the server. Please try again in a moment.'
    }
    errorMessage.value = msg
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <nav class="sticky top-0 z-30 h-15 glass border-b border-[var(--color-border)] dark:border-white/[0.08]">
      <div class="max-w-md mx-auto h-full flex items-center justify-between px-6">
        <NuxtLink
          to="/"
          class="flex items-center gap-2"
        >
          <img
            src="/logo.png"
            alt="SalomKorea"
            class="h-8 w-8 rounded-md object-contain"
          >
          <span class="font-bold text-[15px] tracking-tight text-[var(--color-text-primary)] dark:text-white">Salom<span class="text-primary-600">Korea</span></span>
        </NuxtLink>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-white/5 transition-colors"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="size-3.5"
          />
          Home
        </NuxtLink>
      </div>
    </nav>

    <div class="flex flex-col items-center px-6 pt-12 pb-16">
      <header class="text-center mb-8 w-full max-w-md">
        <h1 class="text-[28px] sm:text-[32px] font-bold tracking-tight text-[var(--color-text-primary)] dark:text-white leading-tight">
          Visa Status Check
        </h1>
      </header>

      <UCard
        class="w-full max-w-md"
        :ui="{ body: 'p-7' }"
      >
        <div class="grid grid-cols-3 gap-1 p-1 rounded-md bg-primary-50 dark:bg-white/5 mb-6">
          <button
            type="button"
            class="rounded-sm py-2.5 text-[13.5px] font-semibold transition-colors"
            :class="visaType === 'Embassy' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
            @click="selectType('Embassy')"
          >
            Embassy
          </button>
          <button
            type="button"
            class="rounded-sm py-2.5 text-[13.5px] font-semibold transition-colors"
            :class="visaType === 'E-Visa' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
            @click="selectType('E-Visa')"
          >
            E-Visa
          </button>
          <button
            type="button"
            class="rounded-sm py-2.5 text-[13.5px] font-semibold transition-colors"
            :class="visaType === 'Regional' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)]'"
            @click="selectType('Regional')"
          >
            Regional
          </button>
        </div>

        <form
          class="space-y-4"
          @submit.prevent="handleSearch"
        >
          <UFormField label="Passport Number">
            <UInput
              :model-value="form.passport"
              placeholder="FA1234567"
              maxlength="20"
              size="lg"
              class="w-full"
              :color="fieldErrors.passport ? 'error' : 'neutral'"
              autocomplete="off"
              autocapitalize="characters"
              @input="handlePassportInput"
              @keydown.enter="handleSearch"
            />
          </UFormField>

          <UFormField label="Full Name (as in passport)">
            <div
              v-if="autofillLoading && !userEdited.name"
              class="h-11 rounded-lg bg-neutral-200/70 dark:bg-white/10 animate-pulse"
            />
            <UInput
              v-else
              :model-value="form.name"
              placeholder="AKHMATOV AZIZBEK MAKHMUDJON UGLI"
              size="lg"
              class="w-full"
              :ui="{ base: 'text-sm sm:text-base' }"
              :color="fieldErrors.name ? 'error' : 'neutral'"
              autocomplete="off"
              autocapitalize="characters"
              @input="handleNameInput"
              @keydown.enter="handleSearch"
            />
          </UFormField>

          <UFormField label="Date of Birth">
            <div
              v-if="autofillLoading && !userEdited.dob"
              class="h-11 rounded-lg bg-neutral-200/70 dark:bg-white/10 animate-pulse"
            />
            <UInput
              v-else
              :model-value="form.dob"
              placeholder="YYYY-MM-DD"
              maxlength="10"
              size="lg"
              class="w-full"
              :color="fieldErrors.dob ? 'error' : 'neutral'"
              autocomplete="off"
              inputmode="numeric"
              @input="handleDobInput"
              @keydown.enter="handleSearch"
            />
          </UFormField>

          <UFormField
            v-if="visaType === 'E-Visa' || visaType === 'Regional'"
            label="Application Number"
          >
            <UInput
              :model-value="form.appNo"
              placeholder="AP2026123456"
              maxlength="30"
              size="lg"
              class="w-full"
              :color="fieldErrors.appNo ? 'error' : 'neutral'"
              autocomplete="off"
              autocapitalize="characters"
              @input="handleUppercase('appNo', $event)"
              @keydown.enter="handleSearch"
            />
          </UFormField>

          <UiLoadingButton
            type="submit"
            block
            size="lg"
            color="primary"
            class="mt-1"
            :loading="submitting"
          >
            Check Status
          </UiLoadingButton>

          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            :title="errorMessage"
          />
        </form>
      </UCard>

      <div class="w-full max-w-md mt-4">
        <VisaTelegramBanner />
      </div>

      <div
        ref="resultContainerRef"
        v-if="resultState !== 'idle'"
        class="w-full max-w-md mt-4 scroll-mt-20"
      >
        <VisaResultSkeleton v-if="resultState === 'loading'" />
        <VisaNotFoundCard v-else-if="resultState === 'not-found'" />
        <VisaResultCard
          v-else-if="resultState === 'result' && resultData"
          :result="resultData"
          :input="submittedInput"
          :visa-type="visaType"
          :cached="resultCached"
        />
      </div>

      <footer class="mt-10 text-center text-[13px] text-[var(--color-text-secondary)]">
        <NuxtLink
          to="/"
          class="border-b border-[var(--color-border)] hover:text-[var(--color-text-primary)] dark:hover:text-white transition-colors"
        >
          ← Back to Home
        </NuxtLink>
      </footer>
    </div>
  </div>
</template>
