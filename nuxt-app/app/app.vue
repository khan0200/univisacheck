<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/png', href: '/logo.png' },
    { rel: 'apple-touch-icon', href: '/logo.png' }
  ],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  titleTemplate: title => (title ? `${title} — SalomKorea` : 'SalomKorea — Visa & Education Application'),
  ogSiteName: 'SalomKorea',
  ogImage: '/logo.png'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
