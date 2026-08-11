<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/png', href: '/favicon-32x32.png', sizes: '32x32' },
    { rel: 'icon', type: 'image/png', href: '/icon-120.png', sizes: '120x120' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }
  ],
  htmlAttrs: { lang: 'uz' }
})

useSeoMeta({
  titleTemplate: title => (title ? `${title} — SalomKorea` : 'SalomKorea — Koreya vizasi va ta\'lim'),
  ogSiteName: 'SalomKorea',
  ogImage: 'https://salomkorea.uz/hero_banner.png',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://salomkorea.uz/hero_banner.png'
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
