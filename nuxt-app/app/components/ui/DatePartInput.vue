<script setup lang="ts">
const props = defineProps<{
  modelValue?: string | null
  placeholderYear?: string
  clearable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'complete': []
  'clear': []
}>()

const currentYear = new Date().getFullYear().toString()

const yyyy = ref(currentYear)
const mm = ref('')
const dd = ref('')

const rootRef = ref<HTMLElement | null>(null)
const mmRef = ref<HTMLInputElement | null>(null)
const ddRef = ref<HTMLInputElement | null>(null)

let lastEmitted = ''

function syncFromModel(val?: string | null) {
  if (val === lastEmitted) return
  if (!val) {
    yyyy.value = currentYear
    mm.value = ''
    dd.value = ''
    lastEmitted = ''
    return
  }
  const parts = val.split('-')
  if (parts.length === 3) {
    yyyy.value = parts[0] || currentYear
    mm.value = parts[1] || ''
    dd.value = parts[2] || ''
    lastEmitted = val
  }
}

watch(() => props.modelValue, syncFromModel, { immediate: true })

function emitCombined() {
  const y = yyyy.value.trim() || currentYear
  const m = mm.value.trim()
  const d = dd.value.trim()

  if (!m && !d) {
    lastEmitted = ''
    emit('update:modelValue', '')
    return
  }

  // If user entered both month and day
  if (m && d) {
    const paddedM = m.padStart(2, '0')
    const paddedD = d.padStart(2, '0')
    const formatted = `${y}-${paddedM}-${paddedD}`
    lastEmitted = formatted
    emit('update:modelValue', formatted)
  } else if (m) {
    // Only month entered so far
    const paddedM = m.padStart(2, '0')
    const formatted = `${y}-${paddedM}-01`
    lastEmitted = formatted
    emit('update:modelValue', formatted)
  }
}

function clearDate() {
  mm.value = ''
  dd.value = ''
  lastEmitted = ''
  emit('update:modelValue', '')
  emit('clear')
  nextTick(() => {
    mmRef.value?.focus()
  })
}

function advanceToNextDateGroup() {
  nextTick(() => {
    const container = rootRef.value
    if (!container) return
    const allContainers = Array.from(document.querySelectorAll('.date-part-container'))
    const currentIndex = allContainers.indexOf(container)
    if (currentIndex !== -1 && currentIndex < allContainers.length - 1) {
      const nextContainer = allContainers[currentIndex + 1]
      const nextMm = nextContainer?.querySelector<HTMLInputElement>('.date-part-mm')
      if (nextMm) {
        nextMm.focus()
        nextMm.select()
      }
    }
  })
}

function moveToPrevDateGroup() {
  nextTick(() => {
    const container = rootRef.value
    if (!container) return
    const allContainers = Array.from(document.querySelectorAll('.date-part-container'))
    const currentIndex = allContainers.indexOf(container)
    if (currentIndex > 0) {
      const prevContainer = allContainers[currentIndex - 1]
      const prevDd = prevContainer?.querySelector<HTMLInputElement>('.date-part-dd')
      if (prevDd) {
        prevDd.focus()
        prevDd.select()
      }
    }
  })
}

function handleYearInput(e: Event) {
  const input = e.target as HTMLInputElement
  let val = input.value.replace(/\D/g, '')
  if (val.length > 4) val = val.slice(0, 4)
  yyyy.value = val
  if (val.length === 4) {
    mmRef.value?.focus()
    mmRef.value?.select()
  }
  emitCombined()
}

function handleMonthInput(e: Event) {
  const input = e.target as HTMLInputElement
  let val = input.value.replace(/\D/g, '')
  if (val.length > 2) val = val.slice(0, 2)
  if (val.length > 0) {
    const num = parseInt(val, 10)
    if (num > 12) val = '12'
  }
  mm.value = val

  // Auto-advance if 2 digits (e.g. 05) or first digit is >= 2 (e.g. 2-9 becomes 02-09)
  if (val.length === 2 || (val.length === 1 && parseInt(val, 10) >= 2)) {
    if (val.length === 1 && parseInt(val, 10) >= 2) {
      mm.value = '0' + val
    }
    ddRef.value?.focus()
    ddRef.value?.select()
  }
  emitCombined()
}

function handleDayInput(e: Event) {
  const input = e.target as HTMLInputElement
  let val = input.value.replace(/\D/g, '')
  if (val.length > 2) val = val.slice(0, 2)
  if (val.length > 0) {
    const num = parseInt(val, 10)
    if (num > 31) val = '31'
  }
  dd.value = val

  // Auto-advance to next date group (e.g. GACHA MM) if 2 digits (e.g. 25) or day >= 4
  if (val.length === 2 || (val.length === 1 && parseInt(val, 10) >= 4)) {
    if (val.length === 1 && parseInt(val, 10) >= 4) {
      dd.value = '0' + val
    }
    emitCombined()
    emit('complete')
    advanceToNextDateGroup()
  } else {
    emitCombined()
  }
}

function handleDayBlur() {
  if (dd.value.length === 1) {
    dd.value = '0' + dd.value
  }
  emitCombined()
}

function handleMonthBlur() {
  if (mm.value.length === 1) {
    mm.value = '0' + mm.value
  }
  emitCombined()
}

function handleDayKeydown(e: KeyboardEvent) {
  if (e.key === 'Backspace' && !dd.value) {
    mmRef.value?.focus()
  }
}

function handleMonthKeydown(e: KeyboardEvent) {
  if (e.key === 'Backspace' && !mm.value) {
    moveToPrevDateGroup()
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="date-part-container flex items-center justify-start h-9.5 px-3 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.05] text-xs text-slate-800 dark:text-white transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
  >
    <!-- Year -->
    <input
      :value="yyyy"
      type="text"
      inputmode="numeric"
      maxlength="4"
      :placeholder="currentYear"
      class="date-part-yyyy w-12 text-center font-semibold bg-transparent focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      @input="handleYearInput"
    >

    <span class="text-slate-300 dark:text-slate-600 px-1 font-normal select-none">/</span>

    <!-- Month -->
    <input
      ref="mmRef"
      :value="mm"
      type="text"
      inputmode="numeric"
      maxlength="2"
      placeholder="MM"
      class="date-part-mm w-8 text-center font-semibold bg-transparent focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      @input="handleMonthInput"
      @blur="handleMonthBlur"
      @keydown="handleMonthKeydown"
    >

    <span class="text-slate-300 dark:text-slate-600 px-1 font-normal select-none">/</span>

    <!-- Day -->
    <input
      ref="ddRef"
      :value="dd"
      type="text"
      inputmode="numeric"
      maxlength="2"
      placeholder="DD"
      class="date-part-dd w-8 text-center font-semibold bg-transparent focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      @input="handleDayInput"
      @blur="handleDayBlur"
      @keydown="handleDayKeydown"
    >

    <!-- Red X Clear Button (when clearable and date is typed) -->
    <button
      v-if="clearable && (mm || dd)"
      type="button"
      tabindex="-1"
      class="ml-auto size-5 rounded-full bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white dark:bg-rose-950/60 dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
      title="Sanani tozalash"
      @click="clearDate"
    >
      <UIcon
        name="i-lucide-x"
        class="size-3"
      />
    </button>
  </div>
</template>
