import { defineStore } from 'pinia'
import type { Lead, LeadStatus } from '~/types/lead'

const PAGE_SIZE = 15

export const useLeadsStore = defineStore('leads', () => {
  const leads = ref<Lead[]>([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const activeFilter = ref<LeadStatus | 'all'>('all')
  const sortField = ref<string>('created_at')
  const sortDir = ref<'asc' | 'desc'>('desc')
  const currentPage = ref(1)

  const { fetchLeads } = useLeadsService()

  async function load() {
    isLoading.value = true
    try {
      leads.value = await fetchLeads()
      currentPage.value = 1
    } finally {
      isLoading.value = false
    }
  }

  const statusCounts = computed(() => {
    const counts: Record<string, number> = { NEW: 0, IN_PROGRESS: 0, COMPLETED: 0, CONTACTED: 0, ENROLLED: 0, CANCELLED: 0 }
    for (const l of leads.value) counts[l.status] = (counts[l.status] || 0) + 1
    return counts
  })

  const filteredLeads = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    let rows = leads.value.filter((l) => {
      if (activeFilter.value !== 'all' && l.status !== activeFilter.value) return false
      if (!q) return true
      return [l.full_name, l.phone, l.university_name].some(v => (v || '').toLowerCase().includes(q))
    })

    rows = [...rows].sort((a, b) => {
      let av: string | number = (a as any)[sortField.value]
      let bv: string | number = (b as any)[sortField.value]
      if (sortField.value === 'estimated_visa_approval_percentage') {
        av = Number.parseInt(String(av || '').replace(/\D/g, '')) || -1
        bv = Number.parseInt(String(bv || '').replace(/\D/g, '')) || -1
      } else {
        av = String(av || '').toLowerCase()
        bv = String(bv || '').toLowerCase()
      }
      if (av < bv) return sortDir.value === 'asc' ? -1 : 1
      if (av > bv) return sortDir.value === 'asc' ? 1 : -1
      return 0
    })

    return rows
  })

  const totalPages = computed(() => Math.max(1, Math.ceil(filteredLeads.value.length / PAGE_SIZE)))

  const pageRows = computed(() => {
    const page = Math.min(currentPage.value, totalPages.value)
    return filteredLeads.value.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  })

  function setSort(field: string) {
    if (sortField.value === field) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortField.value = field
      sortDir.value = 'desc'
    }
  }

  function setFilter(filter: LeadStatus | 'all') {
    activeFilter.value = filter
    currentPage.value = 1
  }

  return {
    leads,
    isLoading,
    searchQuery,
    activeFilter,
    sortField,
    sortDir,
    currentPage,
    load,
    statusCounts,
    filteredLeads,
    totalPages,
    pageRows,
    setSort,
    setFilter,
    PAGE_SIZE
  }
})
