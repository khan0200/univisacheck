// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots'
  ],

  imports: {
    dirs: ['services']
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // @ts-expect-error Site config provides global configuration for sitemap/robots modules
  site: {
    url: 'https://salomkorea.uz',
    name: 'SalomKorea',
    description: 'Koreyadagi universitetlarga ariza topshiring, viza holatini tekshiring va hujjatlar ro\'yxatini bilib oling.',
    defaultLocale: 'uz'
  },

  colorMode: {
    preference: 'light',
    fallback: 'light',
    storage: 'sessionStorage'
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || ''
    }
  },

  routeRules: {
    '/': { prerender: true },
    '/cabinet': { ssr: false },
    '/leads': { ssr: false },
    '/dashboard': { ssr: false },
    '/settings': { ssr: false }
  },

  compatibilityDate: '2026-06-30',

  // Vercel function config
  // - /api/ai-assistant: chains multiple AI calls, can exceed the default ~10s timeout
  // - /api/realtime: SSE long-lived connection; maxDuration limits how long the
  //   Vercel function stays open. The client auto-reconnects, so 60s is fine on
  //   Hobby. Upgrade to 300 on Pro for fewer reconnect cycles.
  nitro: {
    vercel: {
      functions: {
        '/api/ai-assistant': { maxDuration: 60 },
        '/api/realtime': { maxDuration: 60 },
        '/api/jobs/worker': { maxDuration: 60 }
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    families: [
      { name: 'Plus Jakarta Sans', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Pretendard', provider: 'fontsource', weights: [400, 500, 600, 700] }
    ]
  },

  icon: {
    provider: 'server',
    serverBundle: {
      collections: ['lucide']
    },
    clientBundle: {
      scan: true,
      includeCustomCollections: true
    }
  }
})
