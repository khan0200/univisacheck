const { createClient } = require('@libsql/client');
const path = require('path');
const { existsSync } = require('fs');
const { pathToFileURL } = require('url');

// Lazily create the client on first real use rather than as a top-level
// module side effect — Nitro's dev bundler (Rollup) hits a
// "Cannot access ... before initialization" TDZ error when a route imports
// a chain of CJS modules where one does eager work (createClient()) at
// import time. server/utils/turso.ts already uses this lazy-singleton
// pattern for the same reason; mirrored here so lib/ai/*.js and friends
// (ported verbatim from the legacy Node backend) don't need to change
// their `const db = require('./db')` + `db.execute(...)` call sites.
//
// require() of the repo-root turso.config.js does NOT work here — this
// runs inside Nitro's ESM runtime, where plain `require` is undefined
// (only available via createRequire or dynamic import()). Config loading
// is therefore async, same as server/utils/turso.ts.
let client = null;
let configPromise = null;

async function loadLocalConfig() {
    try {
        const configPath = path.join(process.cwd(), '..', 'turso.config.js');
        if (!existsSync(configPath)) return {};
        const mod = await import(pathToFileURL(configPath).href);
        return mod.default || mod;
    } catch {
        return {};
    }
}

async function getClient() {
    if (client) return client;
    if (!configPromise) configPromise = loadLocalConfig();
    const config = await configPromise;

    const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || config.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN || config.TURSO_AUTH_TOKEN;

    client = createClient({ url, authToken });
    return client;
}

module.exports = {
    execute: async (...args) => (await getClient()).execute(...args),
    batch: async (...args) => (await getClient()).batch(...args),
    transaction: async (...args) => (await getClient()).transaction(...args),
};
