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

  // Site config provides global configuration for sitemap/robots modules
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
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || ''
    }
  },

  routeRules: {
    // Dynamic SSR pages — always fetches live data so hide/show toggles reflect immediately
    '/': {},
    '/visa-status': {},
    '/auth': { ssr: false },
    '/add': { ssr: false },
    '/cabinet': { ssr: false },
    '/leads': { ssr: false },
    '/dashboard': { ssr: false },
    '/settings': { ssr: false },

    // Public API endpoints with Edge CDN caching & ISR
    '/api/universities': {
      isr: 86400,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, s-maxage=86400',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=86400'
      }
    },
    '/api/admissions': {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
        'CDN-Cache-Control': 'public, s-maxage=60',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60'
      }
    },
    '/api/qabul-dates': {
      isr: 86400,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'CDN-Cache-Control': 'public, s-maxage=86400',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=86400'
      }
    },
    '/api/realtime/config': {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400'
      }
    },

    // Static Assets & Media (1 year immutable edge caching)
    '/_nuxt/**': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    },
    '/**.{png,jpg,jpeg,svg,webp,ico,woff2,ttf}': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    }
  },

  compatibilityDate: '2026-06-30',

  // Vercel function config:
  // Lower memory allocation from default 1024MB down to 256MB to drastically cut
  // GB-hours execution cost by 75% across all serverless invocations.
  nitro: {
    vercel: {
      functions: {
        memory: 256,
        maxDuration: 30
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
