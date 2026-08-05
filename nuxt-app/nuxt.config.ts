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

  imports: {
    dirs: ['services']
  },

  runtimeConfig: {
    public: {
      // Same-origin in production (Vercel rewrites); override for local dev against the legacy proxy.
      apiBase: process.env.NUXT_PUBLIC_API_BASE || ''
    }
  },

  routeRules: {
    '/': { prerender: true },
    // Local dev only: forward /api/* to proxy.js (run separately with `node proxy.js` from the repo root).
    // In production Vercel's own rewrites (vercel.json) handle this instead.
    //
    // proxy.js mounts handlers under specific /api/* prefixes (auth, students,
    // visa-calc-leads, ai-assistant, qabul-dates) plus three bare paths with no
    // /api/ prefix — check-status, notify-telegram, download-visa-pdf — mirroring
    // vercel.json's own rewrites for those same three.
    //
    // These are listed as explicit prefixes rather than a /api/** wildcard
    // because Nitro route rules are defu-merged across all matching rules
    // (not "most specific wins") — a wildcard's `proxy` key survives even
    // under a more specific empty-object rule, so it would swallow requests
    // meant for our own server/api/* routes (e.g. /api/universities, which
    // reads Turso directly). Any new native Nuxt server route must keep its
    // path out of the prefixes below.
    ...(process.env.NODE_ENV !== 'production'
      ? (() => {
          const devApiOrigin = process.env.NUXT_DEV_API_ORIGIN || 'http://localhost:3000'
          return {
            '/api/check-status': { proxy: `${devApiOrigin}/check-status` },
            '/api/notify-telegram': { proxy: `${devApiOrigin}/notify-telegram` },
            '/api/download-visa-pdf': { proxy: `${devApiOrigin}/download-visa-pdf` },
            '/api/auth/**': { proxy: `${devApiOrigin}/api/auth/**` },
            '/api/students/**': { proxy: `${devApiOrigin}/api/students/**` },
            '/api/visa-calc-leads/**': { proxy: `${devApiOrigin}/api/visa-calc-leads/**` },
            '/api/ai-assistant/**': { proxy: `${devApiOrigin}/api/ai-assistant/**` },
            '/api/qabul-dates/**': { proxy: `${devApiOrigin}/api/qabul-dates/**` }
          }
        })()
      : {})
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
