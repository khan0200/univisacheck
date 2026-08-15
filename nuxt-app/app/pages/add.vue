<script setup lang="ts">
import type { Admission } from '~/components/university/AdmissionDetailsModal.vue'
import {
  ACCREDITED_UNIVERSITIES,
  JUNIOR_COLLEGES,
  ONE_PERCENT_UNIVERSITIES,
  ONE_PERCENT_COLLEGES,
  RESTRICTED_BACHELOR_UNIVERSITIES,
  RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES
} from '~/data/accredited-universities'

definePageMeta({ layout: 'public' })

useSeoMeta({
  title: 'Admission Management Panel — SalomKorea',
  description: 'Universitetlar qabul e\'lonlarini boshqarish, yangi qabul qo\'shish, tahrirlash va muddatlarni nazorat qilish paneli.',
  ogTitle: 'SalomKorea — Admission Management Panel'
})

const toast = useToast()

// Universities datalist
const KOREAN_UNIVERSITIES = [
  'AJOU UNIVERSITY (SUWON, GYEONGGI)',
  'ANYANG UNIVERSITY (ANYANG, GYEONGGI)',
  'BAEKSEOK UNIVERSITY (CHEONAN, CHUNGNAM)',
  'BUSAN UNIVERSITY OF FOREIGN STUDIES (GEUMJEONG, BUSAN)',
  'BUSAN INSTITUTE OF SCIENCE AND TECHNOLOGY (BUK-GU, BUSAN)',
  'BUCHEON UNIVERSITY (BUCHEON, GYEONGGI)',
  'CATHOLIC UNIVERSITY OF KOREA (BUCHEON, GYEONGGI)',
  'CHANGWON NATIONAL UNIVERSITY (CHANGWON, GYEONGNAM)',
  'CHANGSHIN UNIVERSITY (MASAN, GYEONGNAM)',
  'CHA UNIVERSITY (PANGYO, GYEONGGI)',
  'CHEONGAM UNIVERSITY (SUNCHEON, JEONNAM)',
  'CHEONGJU UNIVERSITY (CHEONGJU, CHUNGBUK)',
  'CHONNAM NATIONAL UNIVERSITY (BUK-GU, GWANGJU)',
  'CHOSUN UNIVERSITY (DONG-GU, GWANGJU)',
  'CHUNG-ANG UNIVERSITY (DONGJAK, SEOUL)',
  'CHUNGBUK HEALTH & SCIENCE UNIVERSITY (CHEONJU, CHUNGBUK)',
  'CHUNGBUK NATIONAL UNIVERSITY (CHEONGJU, CHUNGBUK)',
  'CHUNGCHEONG COLLEGE (CHEONGJU, CHUNCHEONG-BUK DO)',
  'CHUNGNAM NATIONAL UNIVERSITY (YUSEONG, DAEJEON)',
  'DAEGU UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'DAEGU CATHOLIC UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'DAEGU HAANY UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'DAEJEON UNIVERSITY (DONG-GU, DAEJEON)',
  'DAEJIN UNIVERSITY (POCHEON, GYEONGGI)',
  'DAESHIN UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'DAEWON UNIVERSITY COLLEGE (JECHEON, CHUNGBUK)',
  'DAELIM UNIVERSITY (ANYANG, GYEONGGI)',
  'DONG EUI COLLEGE (BUSANJIN, BUSAN)',
  'DONG-A UNIVERSITY (SAHA, BUSAN)',
  'DONG-EUI UNIVERSITY (BUSANJIN, BUSAN)',
  'DONG-EUI INSTITUTE OF TECHNOLOGY (BUSANJIN, BUSAN)',
  'DONGDUK WOMEN\'S UNIVERSITY (SEONGBUK, SEOUL)',
  'DONGGUK UNIVERSITY (JUNG-GU, SEOUL)',
  'DONGSEO UNIVERSITY (SASANG, BUSAN)',
  'DONGSHIN UNIVERSITY (NAJU, JEONNAM)',
  'DONGWON INSTITUTE OF SCIENCE AND TECHNOLOGY (YANGSAN, GYEONGNAM)',
  'DUKSUNG WOMEN\'S UNIVERSITY (DOBONG, SEOUL)',
  'EULJI UNIVERSITY (SEONGNAM, GYEONGGI)',
  'EWHA WOMANS UNIVERSITY (SEODAEMUN, SEOUL)',
  'FAR EAST UNIVERSITY (EUMSEONG, CHUNGBUK)',
  'GACHON UNIVERSITY (SEONGNAM, GYEONGGI)',
  'GANGNAM UNIVERSITY (YONGIN, GYEONGGI)',
  'GANGSEO UNIVERSITY (GANGSEO, SEOUL)',
  'GANGNEUNG-WONJU NATIONAL UNIVERSITY (GANGNEUNG, GANGWON)',
  'GIMCHEON UNIVERSITY (GIMCHEON, GYEONGBUK)',
  'GONGJU NATIONAL UNIVERSITY (GONGJU, CHUNGNAM)',
  'GUNJANG UNIVERSITY (GUNSAN, JEONBUK)',
  'GWANGJU INSTITUTE OF SCIENCE AND TECHNOLOGY (BUK-GU, GWANGJU)',
  'GWANGJU UNIVERSITY (NAM-GU, GWANGJU)',
  'GWANGJU WOMEN\'S UNIVERSITY (GWANGSAN, GWANGJU)',
  'GYEONGSANG NATIONAL UNIVERSITY (JINJU, GYEONGNAM)',
  'GYEONGIN WOMEN\'S UNIVERSITY (GYEYANG, INCHEON)',
  'HALLYM UNIVERSITY (CHUNCHEON, GANGWON)',
  'HANDONG GLOBAL UNIVERSITY (BUK-GU, POHANG)',
  'HANBAT NATIONAL UNIVERSITY (YUSEONG, DAEJEON)',
  'HANKUK UNIVERSITY OF FOREIGN STUDIES (DONGDAEMUN, SEOUL)',
  'HANNAM UNIVERSITY (DAEDEOK, DAEJEON)',
  'HANSEO UNIVERSITY (SEOSAN, CHUNGNAM)',
  'HANSEI UNIVERSITY (GUNPO, GYEONGGI)',
  'HANSUNG UNIVERSITY (SEONGBUK, SEOUL)',
  'HANYANG UNIVERSITY (SEONGDONG, SEOUL)',
  'HANYANG WOMEN\'S UNIVERSITY (SEONGDONG, SEOUL)',
  'HONGIK UNIVERSITY (MAPO, SEOUL)',
  'HOSEO UNIVERSITY (ASAN, CHUNGNAM)',
  'INDUK UNIVERSITY (NOWON, SEOUL)',
  'INHA TECHNICAL COLLEGE (1%)',
  'INHA UNIVERSITY (MICHUHOL, INCHEON)',
  'INCHEON UNIVERSITY (YEONSU, INCHEON)',
  'INJE UNIVERSITY (GIMHAE, GYEONGNAM)',
  'JANGAN UNIVERSITY (HWASEONG, GYEONGGI)',
  'JEONBUK NATIONAL UNIVERSITY (DEOKJIN, JEONJU)',
  'JEONBUK SCIENCE COLLEGE (JEONGEUP, JEONBUK)',
  'JEONJU UNIVERSITY (WANSAN, JEONJU)',
  'JEONJU VISION UNIVERSITY (WANSAN, JEONJU)',
  'JEJU NATIONAL UNIVERSITY (JEJU, JEJU)',
  'JEJU HALLA UNIVERSITY (JEJU, JEJU)',
  'JEJU TOURISM UNIVERSITY (JEJU, JEJU)',
  'JOONGBU UNIVERSITY (GEUMSAN, CHUNGNAM)',
  'JUNGWON UNIVERSITY (GOESAN, CHUNGBUK)',
  'KAIST (YUSEONG, DAEJEON)',
  'KANGWON NATIONAL UNIVERSITY (CHUNCHEON, GANGWON)',
  'KEIMYUNG UNIVERSITY (DALSEO, DAEGU)',
  'KEIMYUNG COLLEGE UNIVERSITY (DALSEO, DAEGU)',
  'KONKUK UNIVERSITY (GWANGJIN, SEOUL)',
  'KOOKMIN UNIVERSITY (SEONGBUK, SEOUL)',
  'KOREA UNIVERSITY (SEONGBUK, SEOUL)',
  'KOREA MARITIME AND OCEAN UNIVERSITY (YEONGDO, BUSAN)',
  'KOREA NATIONAL UNIVERSITY OF EDUCATION (CHEONGJU, CHUNGBUK)',
  'KOREA NATIONAL UNIVERSITY OF TRANSPORTATION (CHUNGJU, CHUNGBUK)',
  'KOREA UNIVERSITY OF MEDIA ARTS (CHEONAN, CHUNGNAM)',
  'KOREA UNIVERSITY OF TECHNOLOGY AND EDUCATION (CHEONAN, CHUNGNAM)',
  'KOREAN AEROSPACE UNIVERSITY (GOYANG, GYEONGGI)',
  'KOREAN BIBLE UNIVERSITY (NOWON, SEOUL)',
  'KOSIN UNIVERSITY (YEONGDO, BUSAN)',
  'KUMOH NATIONAL INSTITUTE OF TECHNOLOGY (GUMI, GYEONGBUK)',
  'KUNJANG UNIVERSITY COLLEGE (GUNSAN, JEONBUK)',
  'KUNSAN NATIONAL UNIVERSITY (GUNSAN, JEONBUK)',
  'KWANGWOON UNIVERSITY (NOWON, SEOUL)',
  'KYONGGI UNIVERSITY (SUWON, GYEONGGI)',
  'KYUNG HEE UNIVERSITY (DONGDAEMUN, SEOUL)',
  'KYUNGBOK UNIVERSITY (NAMYANGJU, GYEONGGI)',
  'KYUNGDONG UNIVERSITY (GOSEONG, GANGWON)',
  'KYUNGIL UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'KYUNGNAM UNIVERSITY (CHANGWON, GYEONGNAM)',
  'KYUNGPOOK NATIONAL UNIVERSITY (BUK-GU, DAEGU)',
  'KYUNGWOON UNIVERSITY (GUMI, GYEONGBUK)',
  'MOKPO NATIONAL UNIVERSITY (MOKPO, JEONNAM)',
  'MOKPO SCIENCE UNIVERSITY (MOKPO, JEONNAM)',
  'MOKWON UNIVERSITY (SEO-GU, DAEJEON)',
  'MYONGJI UNIVERSITY (YONGIN, GYEONGGI)',
  'MYONGJI COLLEGE (SEODAEMUN, SEOUL)',
  'NAMSEOUL UNIVERSITY (CHEONAN, CHUNGNAM)',
  'NAZARENE UNIVERSITY (CHEONAN, CHUNGNAM)',
  'OSAN UNIVERSITY (OSAN, GYEONGGI)',
  'PAICHAI UNIVERSITY (SEO-GU, DAEJEON)',
  'POSTECH (NAM-GU, POHANG)',
  'PUKYONG NATIONAL UNIVERSITY (NAM-GU, BUSAN)',
  'PUSAN NATIONAL UNIVERSITY (GEUMJEONG, BUSAN)',
  'PYEONGTAEK UNIVERSITY (PYEONGTAEK, GYEONGGI)',
  'SAHMYOOK UNIVERSITY (NOWON, SEOUL)',
  'SEJONG UNIVERSITY (GWANGJIN, SEOUL)',
  'SEMYUNG UNIVERSITY (JECHEON, CHUNGBUK)',
  'SEOJEONG UNIVERSITY (YANGJU, GYEONGGI)',
  'SEOUL CHRISTIAN UNIVERSITY (SEODAEMUN, SEOUL)',
  'SEOUL INSTITUTE OF THE ARTS (ANSAN, GYEONGGI)',
  'SEOUL MEDIA INSTITUTE OF TECHNOLOGY (SMIT) (GANGSEO, SEOUL)',
  'SEOUL NATIONAL UNIVERSITY (GWANAK, SEOUL)',
  'SEOUL NATIONAL UNIVERSITY OF SCIENCE AND TECHNOLOGY (NOWON, SEOUL)',
  'SEOYEONG UNIVERSITY (PAJU, GYEONGGI)',
  'SHINHAN UNIVERSITY (UIJEONGBU, GYEONGGI)',
  'SILLA UNIVERSITY (SASANG, BUSAN)',
  'SOGANG UNIVERSITY (MAPO, SEOUL)',
  'SOONCHUNHYANG UNIVERSITY (ASAN, CHUNGNAM)',
  'SOONGSIL UNIVERSITY (DONGJAK, SEOUL)',
  'SUN MOON UNIVERSITY (ASAN, CHUNGNAM)',
  'SUNCHEON JEIL COLLEGE (SUNCHEON, JEONNAM)',
  'SUNGKONGHOE UNIVERSITY (GURO, SEOUL)',
  'SUNGKYUNKWAN UNIVERSITY (JONGNO, SEOUL)',
  'SUNGSHIN WOMENS UNIVERSITY (SEONGBUK, SEOUL)',
  'TONGMYONG UNIVERSITY (NAM-GU, BUSAN)',
  'TONGWON UNIVERSITY (GWANGJU, GYEONGGI)',
  'UIDUK UNIVERSITY (GYEONGJU, GYEONGBUK)',
  'UNIVERSITY OF ULSAN (NAM-GU, ULSAN)',
  'WONKWANG UNIVERSITY (IKSAN, JEONBUK)',
  'WONKWANG HEALTH SCIENCE UNIVERSITY (IKSAN, JEONBUK)',
  'WOOSONG UNIVERSITY (DONG-GU, DAEJEON)',
  'WOOSUK UNIVERSITY (WANJU, JEONBUK)',
  'YEUNGJIN UNIVERSITY (BUK-GU, DAEGU)',
  'YEUNGNAM UNIVERSITY (GYEONGSAN, GYEONGBUK)',
  'YEUNGNAM UNIVERSITY COLLEGE (NAM-GU, DAEGU)',
  'YONG-IN ARTS AND SCIENCE UNIVERSITY (YONGIN, GYEONGGI)',
  'YONSEI UNIVERSITY (SEODAEMUN, SEOUL)',
  'YONSEI UNIVERSITY MIRAE CAMPUS (WONJU, GANGWON)',
  'YOUNG-SAN UNIVERSITY (YANGSAN, GYEONGNAM)'
]

// Master list of 200+ Korean universities & colleges
const allUniSet = new Set<string>()

// 1. Add all from KOREAN_UNIVERSITIES
for (const u of KOREAN_UNIVERSITIES) {
  if (u.trim()) allUniSet.add(u.trim().toUpperCase())
}

// 2. Add all from accredited datasets
const allSources = [
  ...ACCREDITED_UNIVERSITIES,
  ...JUNIOR_COLLEGES,
  ...ONE_PERCENT_UNIVERSITIES,
  ...ONE_PERCENT_COLLEGES,
  ...RESTRICTED_BACHELOR_UNIVERSITIES,
  ...RESTRICTED_LANGUAGE_COURSE_UNIVERSITIES
]

for (const name of allSources) {
  if (!name || !name.trim()) continue
  const upper = name.trim().toUpperCase()
  let exists = false
  for (const existing of allUniSet) {
    if (existing.startsWith(upper) || upper.startsWith(existing)) {
      exists = true
      break
    }
  }
  if (!exists) {
    allUniSet.add(upper)
  }
}

const ALL_UNIVERSITIES = Array.from(allUniSet).sort((a, b) => a.localeCompare(b))

// Filters
const search = ref('')
const levelFilter = ref('all')
const uniTypeFilter = ref('all')
const visaTypeFilter = ref('all')

const levelOptions = [
  { value: 'all', label: 'Ta\'lim darajasi (Barchasi)' },
  { value: 'LANGUAGE COURSE', label: 'TIL KURSI' },
  { value: 'COLLEGE', label: 'KOLLEJ' },
  { value: 'BACHELOR', label: 'BAKALAVR' },
  { value: 'MASTER NO CERTIFICATE', label: 'MAGISTR (SERTIFIKATSIZ)' },
  { value: 'MASTERS', label: 'MAGISTRATURA' }
]

const uniTypeOptions = [
  { value: 'all', label: 'Universitet turi (Barchasi)' },
  { value: '1% Lik universitet', label: '1% LIK UNIVERSITET' },
  { value: 'Xususiy universitet', label: 'XUSUSIY UNIVERSITET' },
  { value: 'Davlat universiteti', label: 'DAVLAT UNIVERSITETI' }
]

const visaTypeOptions = [
  { value: 'all', label: 'Viza turi (Barchasi)' },
  { value: 'Elchixona orqali', label: 'ELCHIXONA ORQALI' },
  { value: 'E-Viza', label: 'E-VIZA' },
  { value: 'Regional viza', label: 'REGIONAL VIZA' },
  { value: 'Telex viza', label: 'TELEX VIZA' }
]

const SEMESTER_SUGGESTIONS = [
  '2026 FALL',
  '2026 WINTER',
  '2027 SPRING',
  '2027 SUMMER',
  '2027 FALL',
  '2027 WINTER',
  '2028 SPRING',
  '2028 SUMMER',
  '2028 FALL',
  '2028 WINTER'
]

// Fetch admissions
const { data: response, pending, refresh } = await useFetch<{ success: boolean, data: Admission[] }>('/api/admissions', {
  default: () => ({ success: true, data: [] })
})

const admissions = computed(() => response.value?.data || [])

// Detail Modal
const viewModalOpen = ref(false)
const selectedAdmission = ref<Admission | null>(null)
function openViewModal(item: Admission) {
  selectedAdmission.value = item
  viewModalOpen.value = true
}

// Form Modal (Add / Edit)
const formModalOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editingId = ref<string | null>(null)
const activeTab = ref<'uni' | 'admission'>('admission')
const isSaving = ref(false)

// University Autocomplete Suggestion Dropdown
const isUniDropdownOpen = ref(false)

const matchingUniversities = computed(() => {
  const q = form.university_name.trim().toLowerCase()
  if (!q) return []
  return ALL_UNIVERSITIES.filter(u => u.toLowerCase().includes(q)).slice(0, 12)
})

function selectUniversity(u: string) {
  form.university_name = u
  isUniDropdownOpen.value = false
}

function handleUniInput() {
  if (form.university_name.trim()) {
    isUniDropdownOpen.value = true
  } else {
    isUniDropdownOpen.value = false
  }
}

function handleUniBlur() {
  setTimeout(() => {
    isUniDropdownOpen.value = false
  }, 250)
}

const form = reactive({
  university_name: '',
  education_level: 'BACHELOR',
  admission_period: '2027 SPRING',
  rounds_count: '1',
  is_expected: false,
  expected_from: '',
  expected_to: '',
  visa_types: [] as string[],
  university_types: [] as string[],
  rounds: [
    {
      roundNumber: 1,
      onlineApplicationFrom: '',
      onlineApplicationTo: '',
      documentSubmission: '',
      interview: '',
      announcement: ''
    }
  ]
})

function resetForm() {
  form.university_name = ''
  form.education_level = 'BACHELOR'
  form.admission_period = '2027 SPRING'
  form.rounds_count = '1'
  form.is_expected = false
  form.expected_from = ''
  form.expected_to = ''
  form.visa_types = ['Elchixona orqali']
  form.university_types = ['1% Lik universitet', 'Xususiy universitet']
  form.rounds = [
    {
      roundNumber: 1,
      onlineApplicationFrom: '',
      onlineApplicationTo: '',
      documentSubmission: '',
      interview: '',
      announcement: ''
    }
  ]
  activeTab.value = 'uni'
}

function handleRoundsCountChange(val: string) {
  form.rounds_count = val
  if (val === 'EXPECTED') {
    form.is_expected = true
    form.rounds = []
  } else {
    form.is_expected = false
    const count = parseInt(val, 10) || 1
    const newRounds = []
    for (let i = 1; i <= count; i++) {
      const existing = form.rounds[i - 1]
      newRounds.push({
        roundNumber: i,
        onlineApplicationFrom: existing?.onlineApplicationFrom || '',
        onlineApplicationTo: existing?.onlineApplicationTo || '',
        documentSubmission: existing?.documentSubmission || '',
        interview: existing?.interview || '',
        announcement: existing?.announcement || ''
      })
    }
    form.rounds = newRounds
  }
}

function openAddModal() {
  formMode.value = 'add'
  editingId.value = null
  resetForm()
  formModalOpen.value = true
}

function openEditModal(item: Admission) {
  formMode.value = 'edit'
  editingId.value = item.id
  resetForm()

  form.university_name = item.university_name || ''
  form.education_level = item.education_level || 'BACHELOR'
  form.admission_period = item.admission_period || ''
  form.visa_types = [...(item.visa_types || [])]
  form.university_types = [...(item.university_types || [])]

  const isExp = item.is_expected || item.rounds_count === 'EXPECTED'
  form.is_expected = !!isExp

  if (isExp) {
    form.rounds_count = 'EXPECTED'
    form.expected_from = item.expected_date_range?.from || ''
    form.expected_to = item.expected_date_range?.to || ''
    form.rounds = []
  } else {
    const count = item.rounds?.length ? String(item.rounds.length) : (item.rounds_count || '1')
    form.rounds_count = count
    form.rounds = (item.rounds || []).map((r, i) => ({
      roundNumber: r.roundNumber || (i + 1),
      onlineApplicationFrom: r.onlineApplicationFrom || '',
      onlineApplicationTo: r.onlineApplicationTo || '',
      documentSubmission: r.documentSubmission || '',
      interview: r.interview || '',
      announcement: r.announcement || ''
    }))
  }

  formModalOpen.value = true
}

// Auto-sync HUJJAT TOPSHIRISH date to match GACHA date if empty or previously synced
watch(
  () => form.rounds.map(r => r.onlineApplicationTo),
  (newTos, oldTos) => {
    form.rounds.forEach((round, idx) => {
      const newTo = newTos[idx]
      const oldTo = oldTos?.[idx]
      if (newTo && newTo.length === 10) {
        if (!round.documentSubmission || (oldTo && round.documentSubmission === oldTo)) {
          round.documentSubmission = newTo
        }
      }
    })
  }
)

interface AdmissionPayload {
  university_name: string
  education_level: string
  admission_period: string
  rounds_count: string
  is_expected: boolean
  visa_types: string[]
  university_types: string[]
  expected_date_range?: { from?: string | null, to?: string | null } | null
  rounds?: typeof form.rounds
}

async function handleSave() {
  if (!form.university_name.trim()) {
    toast.add({ title: 'Iltimos, universitet nomini kiriting', color: 'error' })
    activeTab.value = 'uni'
    return
  }

  const isExpected = form.rounds_count === 'EXPECTED'

  // Validate that dates follow chronological order
  if (!isExpected && form.rounds) {
    for (let i = 0; i < form.rounds.length; i++) {
      const r = form.rounds[i]
      if (!r) continue
      const roundLabel = `${i + 1}-Bosqich`

      // 1. DAN vs GACHA
      if (r.onlineApplicationFrom && r.onlineApplicationTo) {
        if (r.onlineApplicationTo < r.onlineApplicationFrom) {
          toast.add({
            title: `${roundLabel}: Ariza tugash sanasi (${r.onlineApplicationTo}) boshlanish sanasidan (${r.onlineApplicationFrom}) oldin bo'lishi mumkin emas.`,
            color: 'error'
          })
          return
        }
      }

      // 2. HUJJAT TOPSHIRISH vs GACHA
      if (r.onlineApplicationTo && r.documentSubmission) {
        if (r.documentSubmission < r.onlineApplicationTo) {
          toast.add({
            title: `${roundLabel}: Hujjat topshirish sanasi (${r.documentSubmission}) ariza tugash sanasidan (${r.onlineApplicationTo}) oldin bo'lishi mumkin emas.`,
            color: 'error'
          })
          return
        }
      }

      // 3. SUHBAT vs HUJJAT TOPSHIRISH (or GACHA)
      const prevDocDate = r.documentSubmission || r.onlineApplicationTo
      if (r.interview && prevDocDate) {
        if (r.interview < prevDocDate) {
          const fieldName = r.documentSubmission ? 'Hujjat topshirish' : 'Ariza tugash (Gacha)'
          toast.add({
            title: `${roundLabel}: Suhbat sanasi (${r.interview}) ${fieldName} sanasidan (${prevDocDate}) oldin bo'lishi mumkin emas.`,
            color: 'error'
          })
          return
        }
      }

      // 4. NATIJA (E'LON) vs SUHBAT / HUJJAT TOPSHIRISH / GACHA
      const prevInterviewDate = r.interview || r.documentSubmission || r.onlineApplicationTo
      if (r.announcement && prevInterviewDate) {
        if (r.announcement < prevInterviewDate) {
          let fieldName = 'Ariza tugash (Gacha)'
          if (r.interview) fieldName = 'Suhbat'
          else if (r.documentSubmission) fieldName = 'Hujjat topshirish'

          toast.add({
            title: `${roundLabel}: Natija (E'lon) sanasi (${r.announcement}) ${fieldName} sanasidan (${prevInterviewDate}) oldin bo'lishi mumkin emas.`,
            color: 'error'
          })
          return
        }
      }
    }
  }

  isSaving.value = true
  try {
    const payload: AdmissionPayload = {
      university_name: form.university_name.trim().toUpperCase(),
      education_level: form.education_level,
      admission_period: form.admission_period,
      rounds_count: isExpected ? 'EXPECTED' : String(form.rounds.length),
      is_expected: isExpected,
      visa_types: form.visa_types,
      university_types: form.university_types
    }

    if (isExpected) {
      payload.expected_date_range = {
        from: form.expected_from || null,
        to: form.expected_to || null
      }
      payload.rounds = []
    } else {
      payload.expected_date_range = null
      payload.rounds = form.rounds
    }

    const res = await $fetch<{ success: boolean, error?: string }>('/api/admissions/manage', {
      method: 'POST',
      body: {
        action: formMode.value === 'add' ? 'create' : 'update',
        id: editingId.value,
        payload
      }
    })

    if (!res.success) throw new Error(res.error || 'Operation failed')

    toast.add({
      title: formMode.value === 'add' ? 'Qabul e\'loni muvaffaqiyatli qo\'shildi' : 'Qabul e\'loni yangilandi',
      color: 'success'
    })

    formModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    toast.add({
      title: 'Xatolik yuz berdi: ' + (errorObj?.message || 'Saqlab bo\'lmadi'),
      color: 'error'
    })
  } finally {
    isSaving.value = false
  }
}

// Reactive local state for instant toggle feedback
const hiddenState = reactive<Record<string, boolean>>({})

function isHidden(item: Admission): boolean {
  if (item.id in hiddenState) {
    return hiddenState[item.id] ?? false
  }
  return !!item.is_hidden
}

// Toggle Hide/Unhide
async function toggleHide(item: Admission) {
  const current = isHidden(item)
  const next = !current

  // Instant reactive update
  hiddenState[item.id] = next
  item.is_hidden = next

  try {
    const res = await $fetch<{ success: boolean }>('/api/admissions/manage', {
      method: 'POST',
      body: {
        action: 'toggle_hide',
        id: item.id,
        payload: { is_hidden: next }
      }
    })
    if (res.success) {
      toast.add({
        title: next ? 'Qabul yashirildi' : 'Qabul ko\'rinadigan qilindi',
        color: 'neutral'
      })
    } else {
      hiddenState[item.id] = current
      item.is_hidden = current
    }
  } catch (err: unknown) {
    hiddenState[item.id] = current
    item.is_hidden = current
    const errorObj = err as { message?: string }
    toast.add({ title: 'Xatolik: ' + (errorObj?.message || 'Amal bajarilmadi'), color: 'error' })
  }
}

// Delete
const deleteModalOpen = ref(false)
const itemToDelete = ref<Admission | null>(null)
const isDeleting = ref(false)

function confirmDelete(item: Admission) {
  itemToDelete.value = item
  deleteModalOpen.value = true
}

async function handleDelete() {
  if (!itemToDelete.value) return
  isDeleting.value = true
  try {
    const res = await $fetch<{ success: boolean }>('/api/admissions/manage', {
      method: 'POST',
      body: {
        action: 'delete',
        id: itemToDelete.value.id
      }
    })
    if (res.success) {
      toast.add({ title: 'Qabul e\'loni o\'chirildi', color: 'success' })
      deleteModalOpen.value = false
      await refresh()
    }
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    toast.add({ title: 'O\'chirishda xatolik: ' + (errorObj?.message || 'O\'chirib bo\'lmadi'), color: 'error' })
  } finally {
    isDeleting.value = false
  }
}

const levelLabels: Record<string, string> = {
  'BACHELOR': 'BAKALAVR',
  'MASTERS': 'MAGISTRATURA',
  'MASTER NO CERTIFICATE': 'MAGISTR (SERTIFIKATSIZ)',
  'COLLEGE': 'KOLLEJ',
  'LANGUAGE COURSE': 'TIL KURSI'
}

function getEducationLevelName(lvl?: string | null) {
  if (!lvl) return 'BAKALAVR'
  return levelLabels[lvl.toUpperCase()] || lvl.toUpperCase()
}

function getRoundBadgeClass(roundNum: number | string) {
  const num = typeof roundNum === 'number' ? roundNum : parseInt(String(roundNum), 10) || 1
  switch (num) {
    case 1:
      return 'bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60'
    case 2:
      return 'bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60'
    case 3:
      return 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60'
    case 4:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60'
    default:
      return 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60'
  }
}

function getAdmissionStatus(item: Admission) {
  if (item.is_expected || item.rounds_count === 'EXPECTED') {
    let expTime = Infinity
    if (item.expected_date_range?.from) {
      const parsed = Date.parse(item.expected_date_range.from)
      if (!isNaN(parsed)) expTime = parsed
    }
    return {
      type: 'expected',
      priority: 4,
      sortTimestamp: expTime
    }
  }

  const rounds = item.rounds || []
  if (rounds.length === 0) {
    return {
      type: 'outdated',
      priority: 5,
      sortTimestamp: 0
    }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const nowMs = now.getTime()

  let activeEndMs = Infinity
  let soonStartMs = Infinity
  let latestPastEndMs = -Infinity

  for (const r of rounds) {
    if (r.onlineApplicationFrom && r.onlineApplicationTo) {
      const start = new Date(r.onlineApplicationFrom)
      const end = new Date(r.onlineApplicationTo)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      const startMs = start.getTime()
      const endMs = end.getTime()

      if (nowMs >= startMs && nowMs <= endMs) {
        if (endMs < activeEndMs) activeEndMs = endMs
      } else if (nowMs < startMs) {
        if (startMs < soonStartMs) soonStartMs = startMs
      } else {
        if (endMs > latestPastEndMs) latestPastEndMs = endMs
      }
    }
  }

  if (activeEndMs !== Infinity) {
    return {
      type: 'ongoing',
      priority: 1,
      sortTimestamp: activeEndMs
    }
  }

  if (soonStartMs !== Infinity) {
    return {
      type: 'soon',
      priority: 2,
      sortTimestamp: soonStartMs
    }
  }

  return {
    type: 'outdated',
    priority: 5,
    sortTimestamp: latestPastEndMs !== -Infinity ? latestPastEndMs : 0
  }
}

const filteredAdmissions = computed(() => {
  let list = admissions.value
  const q = search.value.trim().toLowerCase()

  if (q) {
    list = list.filter(item => (item.university_name || '').toLowerCase().includes(q))
  }

  if (levelFilter.value && levelFilter.value !== 'all') {
    list = list.filter(item => (item.education_level || '').toUpperCase() === levelFilter.value)
  }

  if (uniTypeFilter.value && uniTypeFilter.value !== 'all') {
    list = list.filter(item => (item.university_types || []).includes(uniTypeFilter.value))
  }

  if (visaTypeFilter.value && visaTypeFilter.value !== 'all') {
    list = list.filter(item => (item.visa_types || []).includes(visaTypeFilter.value))
  }

  // Sort by nearest date
  return [...list].sort((a, b) => {
    const statusA = getAdmissionStatus(a)
    const statusB = getAdmissionStatus(b)

    if (statusA.priority !== statusB.priority) {
      return statusA.priority - statusB.priority
    }

    if (statusA.priority === 1 || statusA.priority === 2 || statusA.priority === 4) {
      if (statusA.sortTimestamp !== statusB.sortTimestamp) {
        return statusA.sortTimestamp - statusB.sortTimestamp
      }
    }

    if (statusA.priority === 5) {
      if (statusA.sortTimestamp !== statusB.sortTimestamp) {
        return statusB.sortTimestamp - statusA.sortTimestamp
      }
    }

    return (a.university_name || '').localeCompare(b.university_name || '')
  })
})
</script>

<template>
  <div class="min-h-screen bg-slate-50/60 dark:bg-[var(--color-bg-dark)]">
    <UiSiteNavbar />

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-3 sm:px-4 py-8 sm:py-10 space-y-6">
      <!-- Top Title & Action Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[var(--color-card-dark)] p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div class="flex items-center gap-3.5">
          <div class="flex items-center justify-center size-12 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20 shrink-0">
            <UIcon
              name="i-lucide-graduation-cap"
              class="size-6"
            />
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Admission Management Panel
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Qabullarni boshqarish, yangi e'lonlar kiritish va muddatlarni yangilash
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            class="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-600/25 flex items-center gap-2 transition-all"
            @click="openAddModal"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-4.5"
            />
            Qabul Qo'shish
          </button>
        </div>
      </div>

      <!-- Filters Section -->
      <div class="bg-white dark:bg-[var(--color-card-dark)] p-4 sm:p-5 rounded-3xl border border-slate-100 dark:border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
          <!-- Search -->
          <div class="lg:col-span-2">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Universitet nomini yozing..."
              size="lg"
              class="w-full"
            />
          </div>

          <!-- Education Level -->
          <div>
            <USelect
              v-model="levelFilter"
              :items="levelOptions"
              value-key="value"
              label-key="label"
              size="lg"
              class="w-full"
            />
          </div>

          <!-- University Type -->
          <div>
            <USelect
              v-model="uniTypeFilter"
              :items="uniTypeOptions"
              value-key="value"
              label-key="label"
              size="lg"
              class="w-full"
            />
          </div>

          <!-- Visa Type -->
          <div>
            <USelect
              v-model="visaTypeFilter"
              :items="visaTypeOptions"
              value-key="value"
              label-key="label"
              size="lg"
              class="w-full"
            />
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.08] text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>Filtr natijalari</span>
          <span class="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-bold">
            {{ filteredAdmissions.length }} ta qabul
          </span>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="pending"
        class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="h-64 rounded-3xl border border-slate-100 dark:border-white/[0.08] bg-white dark:bg-[var(--color-card-dark)] animate-pulse p-6 space-y-4 shadow-xs"
        >
          <div class="flex items-center gap-3">
            <div class="size-11 rounded-2xl bg-slate-200 dark:bg-white/10 shrink-0" />
            <div class="h-5 w-2/3 bg-slate-200 dark:bg-white/10 rounded" />
          </div>
          <div class="flex gap-2">
            <div class="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded-full" />
            <div class="h-6 w-28 bg-slate-200 dark:bg-white/10 rounded-full" />
          </div>
          <div class="h-14 bg-slate-100 dark:bg-white/5 rounded-2xl" />
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredAdmissions.length === 0"
        class="bg-white dark:bg-[var(--color-card-dark)] p-12 rounded-3xl border border-slate-100 dark:border-white/[0.08] text-center shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
      >
        <UiEmptyState
          icon="i-lucide-inbox"
          title="Qabullar topilmadi"
          description="Hozirda tanlangan filtrlar bo'yicha qabul e'lonlari mavjud emas."
        />
      </div>

      <!-- Admissions Cards Grid (Matching User Screenshot 1) -->
      <div
        v-else
        class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        <div
          v-for="item in filteredAdmissions"
          :key="item.id"
          class="bg-white dark:bg-[var(--color-card-dark)] rounded-3xl p-5 border border-slate-100 dark:border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
          :class="{ 'opacity-50 grayscale-[20%] bg-slate-50/70 dark:bg-slate-900/70': isHidden(item) }"
        >
          <div class="space-y-3.5">
            <!-- Card Header (Building Icon + University Name + Hidden Badge) -->
            <div class="flex items-center gap-3">
              <!-- Blue Square Building Icon -->
              <div class="size-11 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 border border-sky-100 dark:border-sky-900/50 flex items-center justify-center shrink-0">
                <UIcon
                  name="i-lucide-building-2"
                  class="size-5.5"
                />
              </div>

              <!-- University Name & Hidden Tag -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="font-bold text-[14.5px] text-slate-900 dark:text-white uppercase tracking-tight leading-snug truncate-2">
                    {{ item.university_name }}
                  </h2>
                </div>
                <span
                  v-if="isHidden(item)"
                  class="inline-block mt-0.5 px-2 py-0.5 text-[9.5px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-md uppercase"
                >
                  Yashirilgan
                </span>
              </div>
            </div>

            <!-- Badges / Pills Row -->
            <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
              <!-- Education Level Pill -->
              <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 uppercase tracking-wider"
              >
                <UIcon
                  name="i-lucide-graduation-cap"
                  class="size-3.5"
                />
                {{ getEducationLevelName(item.education_level) }}
              </span>

              <!-- Visa Types Pills -->
              <span
                v-for="v in (item.visa_types || [])"
                :key="v"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50/70 text-blue-600 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 uppercase tracking-wider"
              >
                <UIcon
                  name="i-lucide-badge-check"
                  class="size-3.5"
                />
                {{ v }}
              </span>

              <!-- University Types Pills -->
              <span
                v-for="u in (item.university_types || [])"
                :key="u"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 uppercase tracking-wider"
              >
                <UIcon
                  name="i-lucide-building"
                  class="size-3.5"
                />
                {{ u }}
              </span>
            </div>

            <!-- Rounds Schedule Box (Light blue box with left blue bar) -->
            <div class="rounded-2xl bg-slate-50/90 dark:bg-white/[0.03] p-3.5 border-l-4 border-l-sky-500 border border-slate-100 dark:border-white/[0.06] space-y-2">
              <!-- Expected State -->
              <div
                v-if="item.is_expected || item.rounds_count === 'EXPECTED'"
                class="flex items-center gap-2.5 text-amber-800 dark:text-amber-200 font-semibold text-xs"
              >
                <span class="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-bold text-xs">
                  KUTILMOQDA
                </span>
                <span v-if="item.expected_date_range?.from || item.expected_date_range?.to">
                  {{ item.expected_date_range?.from || '?' }} → {{ item.expected_date_range?.to || '?' }}
                </span>
                <span
                  v-else
                  class="italic text-slate-500"
                >Sanalar hali e'lon qilinmagan</span>
              </div>

              <!-- Regular Rounds List -->
              <div
                v-else-if="item.rounds && item.rounds.length > 0"
                class="space-y-1.5"
              >
                <div
                  v-for="(r, idx) in item.rounds"
                  :key="idx"
                  class="flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-100"
                >
                  <!-- RN badge -->
                  <span
                    :class="getRoundBadgeClass(r.roundNumber || (idx + 1))"
                    class="px-2.5 py-0.5 rounded-full font-bold text-xs shrink-0 shadow-2xs"
                  >
                    R{{ r.roundNumber || (idx + 1) }}
                  </span>

                  <!-- Dates with arrow -->
                  <div class="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>{{ r.onlineApplicationFrom || '—' }}</span>
                    <UIcon
                      name="i-lucide-arrow-right"
                      class="size-3.5 text-sky-500 shrink-0"
                    />
                    <span>{{ r.onlineApplicationTo || '—' }}</span>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="text-xs text-slate-400 italic"
              >
                Sanalar kiritilmagan
              </div>
            </div>
          </div>

          <!-- Card Actions (4 Action Buttons) -->
          <div class="rounded-2xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.06] grid grid-cols-4 divide-x divide-slate-100 dark:divide-white/[0.06] overflow-hidden">
            <!-- View -->
            <button
              type="button"
              class="py-3 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-white/5 transition-all"
              title="Ko'rish"
              aria-label="Ko'rish"
              @click="openViewModal(item)"
            >
              <UIcon
                name="i-lucide-eye"
                class="size-5"
              />
            </button>

            <!-- Edit -->
            <button
              type="button"
              class="py-3 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-white dark:hover:bg-white/5 transition-all"
              title="Tahrirlash"
              aria-label="Tahrirlash"
              @click="openEditModal(item)"
            >
              <UIcon
                name="i-lucide-pencil"
                class="size-4.5"
              />
            </button>

            <!-- Toggle Hide / Show -->
            <button
              type="button"
              class="py-3 flex items-center justify-center transition-all hover:bg-white dark:hover:bg-white/5 cursor-pointer"
              :class="isHidden(item) ? 'text-slate-300 dark:text-slate-600 hover:text-emerald-500' : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700'"
              :title="isHidden(item) ? 'Yashirilgan (Ko\'rsatish uchun bosing)' : 'Ko\'rinmoqda (Yashirish uchun bosing)'"
              :aria-label="isHidden(item) ? 'Ko\'rsatish' : 'Yashirish'"
              @click="toggleHide(item)"
            >
              <!-- VISIBLE (ON): Toggle Right -->
              <svg
                v-if="!isHidden(item)"
                class="size-5.5 transition-transform hover:scale-110"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="1"
                  y="5"
                  width="22"
                  height="14"
                  rx="7"
                  ry="7"
                />
                <circle
                  cx="16"
                  cy="12"
                  r="3.5"
                  fill="currentColor"
                />
              </svg>

              <!-- HIDDEN (OFF): Toggle Left -->
              <svg
                v-else
                class="size-5.5 text-slate-300 dark:text-slate-600 transition-transform hover:scale-110"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="1"
                  y="5"
                  width="22"
                  height="14"
                  rx="7"
                  ry="7"
                />
                <circle
                  cx="8"
                  cy="12"
                  r="3"
                />
              </svg>
            </button>

            <!-- Delete -->
            <button
              type="button"
              class="py-3 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-white/5 transition-all"
              title="O'chirish"
              aria-label="O'chirish"
              @click="confirmDelete(item)"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="size-4.5"
              />
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Details Modal -->
    <UniversityAdmissionDetailsModal
      v-model:open="viewModalOpen"
      :admission="selectedAdmission"
    />

    <!-- Add / Edit Modal (Matching User Screenshot 2) -->
    <UModal
      :open="formModalOpen"
      :ui="{ content: 'sm:max-w-3xl rounded-3xl max-h-[92vh] flex flex-col overflow-hidden' }"
      @update:open="formModalOpen = $event"
    >
      <template #content>
        <div class="p-4 sm:p-5 flex flex-col max-h-[92vh] bg-white dark:bg-[var(--color-card-dark)] rounded-3xl">
          <!-- Modal Header (Fixed) -->
          <div class="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-white/[0.08] shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="size-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
                <UIcon
                  name="i-lucide-graduation-cap"
                  class="size-5"
                />
              </div>
              <h2 class="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                {{ formMode === 'add' ? 'Qabul E\'lonini Qo\'shish' : 'Qabul E\'lonini Tahrirlash' }}
              </h2>
            </div>

            <button
              type="button"
              class="size-7.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
              @click="formModalOpen = false"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4.5"
              />
            </button>
          </div>

          <!-- Tab Navigation (Fixed) -->
          <div class="flex items-center gap-5 border-b border-slate-100 dark:border-white/[0.08] text-xs font-semibold pt-1 shrink-0">
            <button
              type="button"
              class="pb-2 flex items-center gap-1.5 transition-colors border-b-2"
              :class="activeTab === 'uni' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
              @click="activeTab = 'uni'"
            >
              <UIcon
                name="i-lucide-building-2"
                class="size-3.5"
              />
              Universitet
            </button>
            <button
              type="button"
              class="pb-2 flex items-center gap-1.5 transition-colors border-b-2"
              :class="activeTab === 'admission' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
              @click="activeTab = 'admission'"
            >
              <UIcon
                name="i-lucide-calendar-days"
                class="size-3.5"
              />
              Qabul
            </button>
          </div>

          <!-- Form Body (Scrollable) -->
          <form
            class="flex-1 overflow-y-auto max-h-[calc(92vh-130px)] pr-1 pt-3 pb-2 space-y-3"
            @submit.prevent="handleSave"
          >
            <!-- TAB 1: Universitet -->
            <div
              v-show="activeTab === 'uni'"
              class="space-y-3"
            >
              <!-- University Card with Auto-Suggest Dropdown -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3.5 bg-white dark:bg-white/[0.02]">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  UNIVERSITET <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <input
                    v-model="form.university_name"
                    required
                    autocomplete="off"
                    placeholder="Universitet nomini yozing (masalan: Korea, Yonsei, Inha)..."
                    class="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.05] text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase placeholder:normal-case placeholder:font-normal"
                    @input="handleUniInput"
                    @focus="handleUniInput"
                    @blur="handleUniBlur"
                  >

                  <!-- Custom Suggestions Dropdown Below Input -->
                  <div
                    v-if="isUniDropdownOpen && matchingUniversities.length > 0"
                    class="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.12] shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06] p-1.5"
                  >
                    <button
                      v-for="u in matchingUniversities"
                      :key="u"
                      type="button"
                      class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-white/10 hover:text-blue-600 transition-all flex items-center gap-2.5 cursor-pointer"
                      @mousedown.prevent="selectUniversity(u)"
                    >
                      <UIcon
                        name="i-lucide-building-2"
                        class="size-3.5 text-blue-500 shrink-0"
                      />
                      <span class="truncate">{{ u }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Education Level Card -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3.5 bg-white dark:bg-white/[0.02]">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  TA'LIM DARAJASI <span class="text-rose-500">*</span>
                </label>
                <USelect
                  v-model="form.education_level"
                  :items="[
                    { value: 'BACHELOR', label: 'BAKALAVR' },
                    { value: 'MASTERS', label: 'MAGISTRATURA' },
                    { value: 'MASTER NO CERTIFICATE', label: 'MAGISTR (SERTIFIKATSIZ)' },
                    { value: 'COLLEGE', label: 'KOLLEJ' },
                    { value: 'LANGUAGE COURSE', label: 'TIL KURSI' }
                  ]"
                  value-key="value"
                  label-key="label"
                  size="md"
                  class="w-full font-medium"
                />
              </div>

              <!-- Visa Types Card -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3.5 bg-white dark:bg-white/[0.02]">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  VIZA TURI
                </label>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <label
                    v-for="v in ['Elchixona orqali', 'E-Viza', 'Regional viza', 'Telex viza']"
                    :key="v"
                    class="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200"
                  >
                    <input
                      v-model="form.visa_types"
                      type="checkbox"
                      :value="v"
                      class="rounded text-blue-600 focus:ring-blue-500 size-3.5"
                    >
                    <span>{{ v }}</span>
                  </label>
                </div>
              </div>

              <!-- University Types Card -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3.5 bg-white dark:bg-white/[0.02]">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  UNIVERSITET TURI
                </label>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <label
                    v-for="u in ['1% Lik universitet', 'Xususiy universitet', 'Davlat universiteti']"
                    :key="u"
                    class="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200"
                  >
                    <input
                      v-model="form.university_types"
                      type="checkbox"
                      :value="u"
                      class="rounded text-blue-600 focus:ring-blue-500 size-3.5"
                    >
                    <span>{{ u }}</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- TAB 2: Qabul (Screenshot 2 Exact Design) -->
            <div
              v-show="activeTab === 'admission'"
              class="space-y-3"
            >
              <!-- Card 1: QABUL SEMESTRI -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3 bg-white dark:bg-white/[0.02] space-y-2">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  QABUL SEMESTRI (SEMISTER)
                </label>
                <input
                  v-model="form.admission_period"
                  placeholder="2027 SPRING"
                  class="w-full h-9.5 px-3 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.05] text-xs font-semibold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >

                <!-- Quick Pickup Suggestions -->
                <div class="flex flex-wrap items-center gap-1 pt-0.5">
                  <button
                    v-for="sem in SEMESTER_SUGGESTIONS"
                    :key="sem"
                    type="button"
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer border"
                    :class="form.admission_period === sem
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-white/10 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-white/15 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-200'"
                    @click="form.admission_period = sem"
                  >
                    {{ sem }}
                  </button>
                </div>
              </div>

              <!-- Card 2: BOSQICHLAR SONI -->
              <div class="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3 bg-white dark:bg-white/[0.02]">
                <label class="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  BOSQICHLAR SONI <span class="text-rose-500">*</span>
                </label>
                <USelect
                  :model-value="form.rounds_count"
                  :items="[
                    { value: '1', label: '1 Bosqich' },
                    { value: '2', label: '2 Bosqich' },
                    { value: '3', label: '3 Bosqich' },
                    { value: '4', label: '4 Bosqich' },
                    { value: '5', label: '5 Bosqich' },
                    { value: 'EXPECTED', label: 'Kutilmoqda (Sanalar hali noaniq)' }
                  ]"
                  value-key="value"
                  label-key="label"
                  size="md"
                  class="w-full font-medium"
                  @update:model-value="handleRoundsCountChange"
                />
              </div>

              <!-- Expected Date Range Box -->
              <div
                v-if="form.rounds_count === 'EXPECTED'"
                class="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2.5"
              >
                <div class="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                  <UIcon
                    name="i-lucide-clock"
                    class="size-3.5"
                  />
                  Kutilayotgan Sana Oralig'i (Ixtiyoriy)
                </div>
                <div class="grid grid-cols-2 gap-2.5">
                  <div>
                    <label class="block text-[10.5px] font-semibold text-amber-800 dark:text-amber-300 mb-1">DAN</label>
                    <UiDatePartInput v-model="form.expected_from" />
                  </div>
                  <div>
                    <label class="block text-[10.5px] font-semibold text-amber-800 dark:text-amber-300 mb-1">GACHA</label>
                    <UiDatePartInput v-model="form.expected_to" />
                  </div>
                </div>
              </div>

              <!-- Regular Rounds List (Left Blue Border Cards Matching Screenshot 2) -->
              <div
                v-else
                class="space-y-3"
              >
                <div
                  v-for="(r, idx) in form.rounds"
                  :key="idx"
                  class="rounded-2xl border border-slate-200 dark:border-white/[0.08] border-l-4 border-l-blue-600 p-3.5 sm:p-4 bg-white dark:bg-white/[0.02] space-y-3 shadow-xs"
                >
                  <!-- Round Title Header with blue badge -->
                  <div class="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <span class="size-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center">
                      {{ idx + 1 }}
                    </span>
                    <span class="font-bold text-[11px] text-slate-900 dark:text-white uppercase tracking-wider">
                      {{ idx + 1 }}-BOSQICH
                    </span>
                  </div>

                  <!-- Online Application Date Range (DAN - GACHA) -->
                  <div>
                    <span class="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      ONLAYN ARIZA TOPSHIRISH MUDDATI
                    </span>
                    <div class="grid grid-cols-2 gap-2.5">
                      <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-0.5">
                          DAN
                        </label>
                        <UiDatePartInput v-model="r.onlineApplicationFrom" />
                      </div>
                      <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-0.5">
                          GACHA
                        </label>
                        <UiDatePartInput v-model="r.onlineApplicationTo" />
                      </div>
                    </div>
                  </div>

                  <!-- Document Submission & Interview (Grid 2 Columns) -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-0.5">
                        HUJJAT TOPSHIRISH
                      </label>
                      <UiDatePartInput
                        v-model="r.documentSubmission"
                        clearable
                      />
                    </div>

                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-0.5">
                        SUHBAT
                      </label>
                      <UiDatePartInput
                        v-model="r.interview"
                        clearable
                      />
                    </div>
                  </div>

                  <!-- Result Announcement (Full width) -->
                  <div>
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-0.5">
                      NATIJA (E'LON)
                    </label>
                    <UiDatePartInput
                      v-model="r.announcement"
                      clearable
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Modal Footer Actions (Sticky Bottom) -->
            <div class="sticky bottom-0 bg-white dark:bg-[var(--color-card-dark)] flex items-center justify-end gap-2.5 pt-2.5 pb-0.5 border-t border-slate-100 dark:border-white/[0.08]">
              <button
                type="button"
                class="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                @click="formModalOpen = false"
              >
                Bekor Qilish
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-600/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <UIcon
                  v-if="!isSaving"
                  name="i-lucide-check-circle-2"
                  class="size-4"
                />
                <UIcon
                  v-else
                  name="i-lucide-loader-2"
                  class="size-4 animate-spin"
                />
                Saqlash
              </button>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal
      :open="deleteModalOpen"
      :ui="{ content: 'sm:max-w-md rounded-3xl' }"
      @update:open="deleteModalOpen = $event"
    >
      <template #content>
        <div class="p-6 space-y-4 bg-white dark:bg-[var(--color-card-dark)] rounded-3xl">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <UIcon
                name="i-lucide-alert-triangle"
                class="size-5.5"
              />
            </div>
            <h3 class="font-bold text-lg text-slate-900 dark:text-white">
              Qabul e'lonini o'chirish
            </h3>
          </div>

          <p class="text-sm text-slate-600 dark:text-slate-300">
            Haqiqatan ham ushbu qabul e'lonini o'chirmoqchimisiz?
          </p>

          <div class="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-800 dark:text-rose-200">
            {{ itemToDelete?.university_name }}
          </div>

          <div class="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              class="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
              @click="deleteModalOpen = false"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              :disabled="isDeleting"
              class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/25 transition-all disabled:opacity-50"
              @click="handleDelete"
            >
              O'chirish
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
