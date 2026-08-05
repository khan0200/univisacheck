<script setup lang="ts">
definePageMeta({ layout: 'public' })

useSeoMeta({
  title: 'Bosh sahifa',
  description: 'Koreyada oqish, universitet tanlash, hujjatlar tayyorlash va viza holatini kuzatish — barchasi bitta platformada.'
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
    <UiSiteFooter />

    <UniversityAdmissionDocsModal v-model:open="admissionModalOpen" />
    <UniversityEmbassyDocsModal v-model:open="embassyModalOpen" />
  </div>
</template>
