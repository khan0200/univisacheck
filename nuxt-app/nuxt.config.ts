// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
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
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'light',
    fallback: 'light',
    storage: 'sessionStorage'
  },

  imports: {
    dirs: ['services']
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || ''
    }
  },

  routeRules: {
    '/': { prerender: true }
  },

  // Vercel function config — the AI assistant route chains OpenAI/Gemini
  // calls (intent analysis, dynamic context lookups, the main completion,
  // optional lead extraction) and can exceed Vercel's default ~10s Hobby
  // timeout; the legacy app set maxDuration: 60 for this same reason.
  nitro: {
    vercel: {
      functions: {
        '/api/ai-assistant': { maxDuration: 60 }
      }
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
