<script setup lang="ts">
definePageMeta({ layout: 'public' })

useSeoMeta({
  title: 'Koreya vizasi va ta\'lim',
  description: 'Koreyada oqish, universitet tanlash, hujjatlar tayyorlash va viza holatini kuzatish — barchasi bitta platformada.',
  ogTitle: 'SalomKorea — Koreya vizasi va ta\'lim'
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        'name': 'SalomKorea — Koreya vizasi va ta\'lim'
      })
    }
  ]
})

const admissionModalOpen = ref(false)
const embassyModalOpen = ref(false)
</script>

<template>
  <div>
    <UiSiteNavbar />
    <UniversityHomeHero />
    <UniversityDocumentsSection
      @open-admission="admissionModalOpen = true"
      @open-embassy="embassyModalOpen = true"
    />
    <UniversitySection />
    <UniversityAccreditedListSection />
    <UniversityAdmissionTableSection />
    <UiSiteFooter />

    <UniversityAdmissionDocsModal v-model:open="admissionModalOpen" />
    <UniversityEmbassyDocsModal v-model:open="embassyModalOpen" />
  </div>
</template>
