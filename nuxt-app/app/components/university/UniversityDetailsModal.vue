<script setup lang="ts">
import type { University } from '~/types/university'
import { programBadgesFor, isRegional, hasMasterEvisa, hasBachelorProgram } from '~/composables/useUniversities'

const props = defineProps<{ open: boolean, university: University | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const programBadges = computed(() => (props.university ? programBadgesFor(props.university) : []))

const tab = ref<'info' | 'majors' | 'grants'>('info')
const imgError = ref(false)

const TABS: { v: 'info' | 'majors' | 'grants', l: string }[] = [
  { v: 'info', l: 'Ma\'lumot' },
  { v: 'majors', l: 'Yo\'nalishlar' },
  { v: 'grants', l: 'Imtiyozlar' }
]

const hasDualVisaTracks = computed(() => Boolean(props.university && hasBachelorProgram(props.university) && hasMasterEvisa(props.university)))
const visaTrack = ref<'bachelor' | 'master-evisa'>('bachelor')

watch(() => props.open, (open) => {
  if (open) {
    tab.value = 'info'
    imgError.value = false
    visaTrack.value = (props.university && !hasBachelorProgram(props.university) && hasMasterEvisa(props.university)) ? 'master-evisa' : 'bachelor'
  }
})

const hasMasters = computed(() => Boolean(props.university?.englishTrackMasters?.length || props.university?.koreanTrackMasters?.length))

const parseMajor = (majorStr: string) => {
  if (!majorStr) return { name: '', detail: '' }
  const lastOpenParen = majorStr.lastIndexOf('(')
  if (lastOpenParen !== -1 && majorStr.endsWith(')')) {
    const name = majorStr.substring(0, lastOpenParen).trim()
    const detail = majorStr.substring(lastOpenParen + 1, majorStr.length - 1).trim()
    return { name, detail }
  }
  return { name: majorStr, detail: '' }
}

const isExempt = computed(() => {
  const u = props.university
  if (!u) return false
  if (hasDualVisaTracks.value) {
    return visaTrack.value === 'master-evisa'
  }
  return Boolean(
    u.is1Percent ||
    isRegional(u) ||
    u.name === 'Anyang University' ||
    u.name === 'Namseoul University' ||
    hasMasterEvisa(u) ||
    u.visaStatus?.toLowerCase().includes('e-viza') ||
    u.visaDetails?.toLowerCase().includes('talab etilmaydi')
  )
})

const activeVisaStatus = computed(() => {
  const u = props.university
  if (!u) return ''
  if (hasDualVisaTracks.value) {
    return visaTrack.value === 'master-evisa' ? 'Magistr E-Viza' : 'Standart Tekshiruv'
  }
  if (u.name === 'Namseoul University') return 'Magistr E-Viza'
  if (isRegional(u) && (u.visaStatus === 'Standart Tekshiruv' || !u.visaStatus)) return 'Regional Viza'
  return u.visaStatus || 'Standart Tekshiruv'
})

const activeVisaDetails = computed(() => {
  const u = props.university
  if (!u) return ''
  if (hasDualVisaTracks.value) {
    if (visaTrack.value === 'master-evisa') {
      return "Magistratura E-Visa tartibi amal qiladi. Elchixonaga ota-ona daromad manbai va 1 oylik KDB bank ko'chirmasi topshirish TALAB ETILMAYDI (faqat qabuldan so'ng 1 kunlik KDB ko'chirmasi topshiriladi)."
    } else {
      return "BAKALAVR UCHUN Standart viza tekshiruvi tartibi. Elchixonaga ota-ona daromad manbai va 31 kunlik KDB ko'chirmasi topshirish TALAB ETILADI."
    }
  }
  if (isRegional(u) && u.visaDetails.includes('TALAB ETILADI')) {
    return "Regional viza tartibi amal qiladi. Elchixonaga ota-ona daromad manbai va 1-oylik KDB bank ko'chirmasi topshirish TALAB ETILMAYDI."
  }
  return u.visaDetails
})

const bankChecklist = computed(() => {
  const u = props.university
  if (!u) return []
  return [
    { label: 'Ota-ona daromad manbai hujjati', included: !isExempt.value },
    { label: '1 oylik KDB bank ko\'chirmasi', included: !isExempt.value },
    { label: `Qabuldan keyingi 1 kunlik KDB bank hujjati (${u.kdb1DayAfterAdmission || '—'})`, included: Boolean(u.kdb1DayAfterAdmission) }
  ]
})

const normalizedImg = computed(() => {
  const img = props.university?.img
  if (!img) return ''
  return img.startsWith('/') || img.startsWith('http') ? img : `/${img}`
})

const webpSrc = computed(() => {
  if (!normalizedImg.value || normalizedImg.value.startsWith('http')) return ''
  return normalizedImg.value.replace(/\.png$/, '.webp')
})
</script>

<template>
  <UModal
    :open="props.open"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div
        v-if="props.university"
        class="max-h-[85vh] overflow-y-auto"
      >
        <div class="relative h-56 sm:h-64 bg-neutral-100 dark:bg-white/5">
          <picture v-if="normalizedImg && !imgError">
            <source
              v-if="webpSrc"
              :srcset="webpSrc"
              type="image/webp"
            >
            <img
              :src="normalizedImg"
              :alt="props.university.name"
              class="w-full h-full object-cover"
              decoding="async"
              @error="imgError = true"
            >
          </picture>
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-white/5 dark:to-white/10"
          >
            <UIcon
              name="i-lucide-landmark"
              class="size-14 text-neutral-300 dark:text-white/20"
            />
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20 pointer-events-none" />
          <button
            type="button"
            class="absolute top-3 right-3 flex items-center justify-center size-9 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-colors"
            aria-label="Yopish"
            @click="emit('update:open', false)"
          >
            <UIcon
              name="i-lucide-x"
              class="size-4.5"
            />
          </button>
          <span class="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-black/40 text-white text-xs font-medium backdrop-blur-sm">
            <UIcon
              name="i-lucide-map-pin"
              class="size-3.5"
            />
            {{ props.university.location }}
          </span>
          <div class="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h2 class="text-lg sm:text-xl font-bold text-white leading-snug">
              {{ props.university.name }}
            </h2>
            <p class="text-sm text-white/80 mt-0.5">
              {{ props.university.koreanName }}
            </p>
          </div>
        </div>

        <div class="px-6 pt-4 pb-2">
          <div class="flex flex-wrap gap-1.5 mb-3">
            <span
              v-for="badge in programBadges"
              :key="badge.key"
              :class="['text-[10.5px] font-semibold px-2 py-1 rounded-sm', badge.class]"
            >
              {{ badge.label }}
            </span>
          </div>
          <p class="text-xs text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-1.5">
            <UIcon
              name="i-lucide-map-pin"
              class="size-3.5 shrink-0 mt-0.5"
            />
            {{ props.university.address }}
          </p>
        </div>

        <div class="px-6 sticky top-0 z-10 bg-white dark:bg-[var(--color-card-dark)]">
          <div class="flex gap-1 border-b border-[var(--color-border)] dark:border-white/[0.08]">
            <button
              v-for="t in TABS"
              :key="t.v"
              type="button"
              class="px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
              :class="tab === t.v ? 'border-primary-700 text-primary-800 dark:border-secondary-300 dark:text-white' : 'border-transparent text-[var(--color-text-secondary)]'"
              @click="tab = t.v as typeof tab"
            >
              {{ t.l }}
            </button>
          </div>
        </div>

        <div class="px-6 py-5">
          <div
            v-if="tab === 'info'"
            class="space-y-5"
          >
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3">
                <p class="text-[11px] text-[var(--color-text-secondary)] mb-1">
                  QS Rank
                </p>
                <p class="text-sm font-semibold">
                  {{ props.university.qsRank }}
                </p>
              </div>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3">
                <p class="text-[11px] text-[var(--color-text-secondary)] mb-1">
                  Tashkil topgan
                </p>
                <p class="text-sm font-semibold">
                  {{ props.university.founded }}
                </p>
              </div>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3">
                <p class="text-[11px] text-[var(--color-text-secondary)] mb-1">
                  Kontrakt narxi
                </p>
                <p class="text-sm font-semibold">
                  {{ props.university.tuition }}
                </p>
              </div>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3">
                <p class="text-[11px] text-[var(--color-text-secondary)] mb-1">
                  Application fee
                </p>
                <p class="text-sm font-semibold">
                  {{ props.university.appFee || '—' }}
                </p>
              </div>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                Til Talablari
              </p>
              <p class="text-sm text-[var(--color-text-primary)] dark:text-white leading-relaxed">
                {{ props.university.language }}
              </p>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                Viza &amp; Bank Shartlari
              </p>

              <div
                v-if="hasDualVisaTracks"
                class="flex items-center gap-1.5 p-1 rounded-lg bg-neutral-100 dark:bg-white/5 mb-3"
              >
                <button
                  type="button"
                  class="flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all"
                  :class="visaTrack === 'bachelor' ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'"
                  @click="visaTrack = 'bachelor'"
                >
                  Bakalavr (Standart)
                </button>
                <button
                  type="button"
                  class="flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all"
                  :class="visaTrack === 'master-evisa' ? 'bg-primary-900 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'"
                  @click="visaTrack = 'master-evisa'"
                >
                  Magistratura (E-Visa)
                </button>
              </div>

              <UBadge
                :color="props.university.is1Percent ? 'success' : isRegional(props.university) ? 'info' : (activeVisaStatus.includes('E-Viza') ? 'primary' : 'warning')"
                variant="solid"
                class="mb-2"
              >
                {{ activeVisaStatus }}
              </UBadge>
              <p
                v-if="activeVisaDetails"
                class="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3"
              >
                {{ activeVisaDetails }}
              </p>
              <div class="space-y-1.5">
                <div
                  v-for="item in bankChecklist"
                  :key="item.label"
                  class="flex items-center gap-2 text-sm"
                >
                  <UIcon
                    :name="item.included ? 'i-lucide-circle-check' : 'i-lucide-circle-minus'"
                    :class="item.included ? 'text-success-500' : 'text-neutral-300'"
                    class="size-4 shrink-0"
                  />
                  <span :class="item.included ? 'text-[var(--color-text-primary)] dark:text-white' : 'text-[var(--color-text-secondary)] line-through'">{{ item.label }}</span>
                </div>
              </div>
              <div
                v-if="hasDualVisaTracks && visaTrack === 'bachelor'"
                class="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-200 text-xs leading-relaxed mt-2.5"
              >
                <UIcon
                  name="i-lucide-info"
                  class="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                />
                <p>
                  <strong>Magistr E-Visa uchun:</strong> Ota-ona daromad manbai va 1 oylik KDB bank ko'chirmasi <u>kerak emas</u>. Yuqoridagi "Magistratura (E-Visa)" tugmasi orqali shartlarni ko'rishingiz mumkin.
                </p>
              </div>
              <div
                v-if="props.university.name === 'Far East University'"
                class="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs leading-relaxed mt-3"
              >
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="size-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="font-bold text-[12px] mb-0.5 text-amber-950 dark:text-amber-100">
                    Muhim ogohlantirish:
                  </p>
                  <p>Standart tekshiruvda ota-ona daromadi va 31 kunlik KDB bank ko'chirmasi kerak. Regional tartibda esa kerak emas.</p>
                </div>
              </div>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                Universitet haqida
              </p>
              <p class="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {{ props.university.description }}
              </p>
            </div>
          </div>

          <div
            v-else-if="tab === 'majors'"
            class="space-y-8"
          >
            <template v-if="hasMasters">
              <!-- BACHELOR SECTION -->
              <div
                v-if="props.university.englishTrackMajors?.length || props.university.koreanTrackMajors?.length"
                class="space-y-4"
              >
                <div class="flex items-center gap-2 pb-2 border-b border-[var(--color-border)] dark:border-white/[0.08]">
                  <div class="flex items-center justify-center size-8 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400">
                    <UIcon
                      name="i-lucide-graduation-cap"
                      class="size-5"
                    />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-[var(--color-text-primary)] dark:text-white uppercase tracking-wider">
                      Bachelor (Bakalavriat)
                    </h3>
                    <p class="text-[10.5px] text-[var(--color-text-secondary)]">
                      Bakalavr bosqichi uchun mavjud yo'nalishlar
                    </p>
                  </div>
                </div>

                <div class="space-y-5">
                  <!-- English Track Bachelors -->
                  <div
                    v-if="props.university.englishTrackMajors?.length"
                    class="space-y-2.5"
                  >
                    <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span class="w-1.5 h-3 bg-blue-500 rounded-full" />
                      ENGLISH TRACK
                    </p>
                    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                      <table class="w-full text-left border-collapse">
                        <thead>
                          <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              Yo'nalish nomi (Major)
                            </th>
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                              Talab / Izoh
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                          <tr
                            v-for="m in props.university.englishTrackMajors"
                            :key="m"
                            class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                          >
                            <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                              {{ parseMajor(m).name }}
                            </td>
                            <td class="px-4 py-2.5 text-sm">
                              <span
                                v-if="parseMajor(m).detail"
                                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                              >
                                {{ parseMajor(m).detail }}
                              </span>
                              <span
                                v-else
                                class="text-neutral-400 dark:text-neutral-500"
                              >—</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Korean Track Bachelors -->
                  <div
                    v-if="props.university.koreanTrackMajors?.length"
                    class="space-y-2.5"
                  >
                    <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span class="w-1.5 h-3 bg-amber-500 rounded-full" />
                      KOREAN TRACK
                    </p>
                    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                      <table class="w-full text-left border-collapse">
                        <thead>
                          <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              Yo'nalish nomi (Major)
                            </th>
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                              Talab / Izoh
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                          <tr
                            v-for="m in props.university.koreanTrackMajors"
                            :key="m"
                            class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                          >
                            <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                              {{ parseMajor(m).name }}
                            </td>
                            <td class="px-4 py-2.5 text-sm">
                              <span
                                v-if="parseMajor(m).detail"
                                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                              >
                                {{ parseMajor(m).detail }}
                              </span>
                              <span
                                v-else
                                class="text-neutral-400 dark:text-neutral-500"
                              >—</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <!-- MASTER SECTION -->
              <div
                v-if="props.university.englishTrackMasters?.length || props.university.koreanTrackMasters?.length"
                class="space-y-4"
              >
                <div class="flex items-center gap-2 pb-2 border-b border-[var(--color-border)] dark:border-white/[0.08]">
                  <div class="flex items-center justify-center size-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                    <UIcon
                      name="i-lucide-award"
                      class="size-5"
                    />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-[var(--color-text-primary)] dark:text-white uppercase tracking-wider">
                      Master (Magistratura)
                    </h3>
                    <p class="text-[10.5px] text-[var(--color-text-secondary)]">
                      Magistr va doktorantura bosqichlari uchun mavjud yo'nalishlar
                    </p>
                  </div>
                </div>

                <div class="space-y-5">
                  <!-- English Track Masters -->
                  <div
                    v-if="props.university.englishTrackMasters?.length"
                    class="space-y-2.5"
                  >
                    <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span class="w-1.5 h-3 bg-blue-500 rounded-full" />
                      ENGLISH TRACK
                    </p>
                    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                      <table class="w-full text-left border-collapse">
                        <thead>
                          <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              Yo'nalish nomi (Major)
                            </th>
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                              Talab / Izoh
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                          <tr
                            v-for="m in props.university.englishTrackMasters"
                            :key="m"
                            class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                          >
                            <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                              {{ parseMajor(m).name }}
                            </td>
                            <td class="px-4 py-2.5 text-sm">
                              <span
                                v-if="parseMajor(m).detail"
                                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                              >
                                {{ parseMajor(m).detail }}
                              </span>
                              <span
                                v-else
                                class="text-neutral-400 dark:text-neutral-500"
                              >—</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Korean Track Masters -->
                  <div
                    v-if="props.university.koreanTrackMasters?.length"
                    class="space-y-2.5"
                  >
                    <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span class="w-1.5 h-3 bg-amber-500 rounded-full" />
                      KOREAN TRACK
                    </p>
                    <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                      <table class="w-full text-left border-collapse">
                        <thead>
                          <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              Yo'nalish nomi (Major)
                            </th>
                            <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                              Talab / Izoh
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                          <tr
                            v-for="m in props.university.koreanTrackMasters"
                            :key="m"
                            class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                          >
                            <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                              {{ parseMajor(m).name }}
                            </td>
                            <td class="px-4 py-2.5 text-sm">
                              <span
                                v-if="parseMajor(m).detail"
                                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                              >
                                {{ parseMajor(m).detail }}
                              </span>
                              <span
                                v-else
                                class="text-neutral-400 dark:text-neutral-500"
                              >—</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <!-- Show without Bachelor/Master headings if hasMasters is false -->
              <!-- English Track -->
              <div
                v-if="props.university.englishTrackMajors?.length"
                class="space-y-2.5"
              >
                <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                  <span class="w-1.5 h-3 bg-blue-500 rounded-full" />
                  ENGLISH TRACK
                </p>
                <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                          Yo'nalish nomi (Major)
                        </th>
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                          Talab / Izoh
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                      <tr
                        v-for="m in props.university.englishTrackMajors"
                        :key="m"
                        class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                      >
                        <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                          {{ parseMajor(m).name }}
                        </td>
                        <td class="px-4 py-2.5 text-sm">
                          <span
                            v-if="parseMajor(m).detail"
                            class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                          >
                            {{ parseMajor(m).detail }}
                          </span>
                          <span
                            v-else
                            class="text-neutral-400 dark:text-neutral-500"
                          >—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Korean Track -->
              <div
                v-if="props.university.koreanTrackMajors?.length"
                class="space-y-2.5"
              >
                <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                  <span class="w-1.5 h-3 bg-amber-500 rounded-full" />
                  KOREAN TRACK
                </p>
                <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                          Yo'nalish nomi (Major)
                        </th>
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                          Talab / Izoh
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                      <tr
                        v-for="m in props.university.koreanTrackMajors"
                        :key="m"
                        class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                      >
                        <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                          {{ parseMajor(m).name }}
                        </td>
                        <td class="px-4 py-2.5 text-sm">
                          <span
                            v-if="parseMajor(m).detail"
                            class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                          >
                            {{ parseMajor(m).detail }}
                          </span>
                          <span
                            v-else
                            class="text-neutral-400 dark:text-neutral-500"
                          >—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Legacy flat majors list -->
              <div
                v-if="props.university.majors?.length && !props.university.englishTrackMajors?.length && !props.university.koreanTrackMajors?.length"
                class="space-y-2.5"
              >
                <p class="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                  <span class="w-1.5 h-3 bg-neutral-500 rounded-full" />
                  YO'NALISHLAR (MAJORS)
                </p>
                <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-[var(--color-border)] dark:border-white/[0.08]">
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                          Yo'nalish nomi (Major)
                        </th>
                        <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] w-[40%]">
                          Talab / Izoh
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.04]">
                      <tr
                        v-for="m in props.university.majors"
                        :key="m"
                        class="hover:bg-neutral-50/30 dark:hover:bg-white/[0.01] transition-colors duration-150"
                      >
                        <td class="px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] dark:text-white">
                          {{ parseMajor(m).name }}
                        </td>
                        <td class="px-4 py-2.5 text-sm">
                          <span
                            v-if="parseMajor(m).detail"
                            class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50"
                          >
                            {{ parseMajor(m).detail }}
                          </span>
                          <span
                            v-else
                            class="text-neutral-400 dark:text-neutral-500"
                          >—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- Fallback if there are absolutely no majors in any list -->
            <div
              v-if="!props.university.englishTrackMajors?.length && !props.university.koreanTrackMajors?.length && !props.university.englishTrackMasters?.length && !props.university.koreanTrackMasters?.length && !props.university.majors?.length"
              class="text-center py-6 text-[var(--color-text-secondary)]"
            >
              Yo'nalishlar haqida ma'lumot yo'q.
            </div>
          </div>

          <div
            v-else
            class="space-y-5"
          >
            <div
              v-if="props.university.bachelorScholarships?.length || props.university.masterScholarships?.length"
              class="space-y-5"
            >
              <div v-if="props.university.bachelorScholarships?.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                  Bakalavr grantlari
                </p>
                <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
                  <div
                    v-for="s in props.university.bachelorScholarships"
                    :key="s.cert"
                    class="flex items-center justify-between px-3.5 py-2.5 text-sm"
                  >
                    <span>{{ s.cert }}</span>
                    <UBadge
                      color="success"
                      variant="solid"
                    >
                      {{ s.percent }}
                    </UBadge>
                  </div>
                </div>
              </div>
              <div v-if="props.university.masterScholarships?.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                  Magistratura grantlari
                </p>
                <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
                  <div
                    v-for="s in props.university.masterScholarships"
                    :key="s.cert"
                    class="flex items-center justify-between px-3.5 py-2.5 text-sm"
                  >
                    <span>{{ s.cert }}</span>
                    <UBadge
                      color="success"
                      variant="solid"
                    >
                      {{ s.percent }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else-if="props.university.scholarships.length"
              class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] divide-y divide-[var(--color-border)] dark:divide-white/[0.06]"
            >
              <div
                v-for="s in props.university.scholarships"
                :key="s.cert"
                class="flex items-center justify-between px-3.5 py-2.5 text-sm"
              >
                <span>{{ s.cert }}</span>
                <UBadge
                  color="success"
                  variant="solid"
                >
                  {{ s.percent }}
                </UBadge>
              </div>
            </div>
            <UiEmptyState
              v-else
              icon="i-lucide-gift"
              title="Grantlar haqida ma'lumot yo'q"
            />

            <p
              v-if="props.university.otherGrantsNote"
              class="text-xs text-[var(--color-text-secondary)] leading-relaxed"
            >
              {{ props.university.otherGrantsNote }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
