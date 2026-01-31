/**
 * Configuration File
 * Centralized settings for the Visa Status Checker application
 */

const CONFIG = {
    // API Configuration
    API: {
        // Proxy endpoint - Vercel serverless function
        PROXY_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000' ?
            'http://localhost:3000/check-status' // Local development with Live Server + standalone proxy.js
            :
            '/api/check-status', // Vercel Dev or Production (Vercel)

        // Polling settings for visa status checks
        POLL_INTERVAL_MS: 2000, // Wait 2 seconds between polls
        MAX_POLL_RETRIES: 10, // Maximum 10 retry attempts
        REQUEST_TIMEOUT_MS: 30000, // 30 second timeout for requests
    },

    // Development/Debug Settings
    DEBUG_MODE: true, // Set to false in production to disable console logs

    // Firebase Collection Name
    FIRESTORE: {
        STUDENTS_COLLECTION: 'unibridge',
    },

    // UI Settings
    UI: {
        TOAST_DURATION_MS: 5000, // Toast notification duration
        SEARCH_DEBOUNCE_MS: 300, // Debounce search input
        ANIMATION_DELAY_PER_ROW: 50, // Stagger row animations (ms)
    },

    // Validation Rules
    VALIDATION: {
        PASSPORT_REGEX: /^[A-Z]{2}\d{7}$/,
        DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
        MIN_BIRTH_YEAR: 1940, // Minimum reasonable birth year
        MAX_FUTURE_DAYS: 0, // Don't allow future dates
    },

    // Status Mappings (Uzbek to English)
    STATUS_MAP: {
        'TASDIQLANGAN': 'APPROVED',
        'BEKOR QILINGAN': 'CANCELLED',
        'RAD ETILGAN': 'REJECTED',
        'KO\'RIB CHIQILMOQDA': 'UNDER REVIEW',
        'QABUL QILINGAN': 'APP/RECEIVED',
        'VIZA TAYYORLANISH BOSQICHIDA': 'UNDER REVIEW',
    },

    // Technical status keywords to ignore (not actual visa statuses)
    TECHNICAL_STATUSES: ['COMPLETED', 'SUCCESS', 'QUEUED', 'DONE', 'IN_PROGRESS', 'PENDING'],
};

// Debug utility function
window.debug = function (...args) {
    if (CONFIG.DEBUG_MODE) {
        console.log('[DEBUG]', ...args);
    }
};

// Export for use in modules
export default CONFIG;