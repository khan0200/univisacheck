<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/logo.png' }
  ],
  htmlAttrs: { lang: 'uz' }
})

useSeoMeta({
  titleTemplate: title => (title ? `${title} — SalomKorea` : 'SalomKorea — Koreya vizasi va ta\'lim'),
  ogSiteName: 'SalomKorea',
  ogImage: '/hero_banner.png',
  twitterCard: 'summary_large_image',
  twitterImage: '/hero_banner.png'
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            'name': 'SalomKorea',
            'url': 'https://salomkorea.uz'
          },
          {
            '@type': 'Organization',
            'name': 'SalomKorea',
            'url': 'https://salomkorea.uz',
            'logo': 'https://salomkorea.uz/logo.png',
            'sameAs': ['https://t.me/salomkoreyauz']
          }
        ]
      })
    }
  ]
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
