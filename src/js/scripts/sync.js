import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';

const API_BASE_URL = CONFIG.API_BASE_URL;

// Central Cache
const cache = {
    instances: null,
    machines: null,
    domains: null,
    usage: null
};

// Promise Tracking
const promises = {
    instances: null,
    machines: null,
    domains: null,
    usage: null
};

// TTL (Time to Live) in milliseconds - 2 minutes
const CACHE_TTL = 2 * 60 * 1000;
const lastFetch = {
    instances: 0,
    machines: 0,
    domains: 0,
    usage: 0
};

/**
 * Initiates a fetch for a specific endpoint and updates the cache.
 * @param {string} key - The cache key (instances, machines, domains, usage).
 * @param {string} endpoint - The API endpoint to call.
 * @param {boolean} silent - Whether to suppress auth popups on failure.
 */
async function performSync(key, endpoint, silent = true) {
    const log = window.appConsole?.log || console.log;
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/${endpoint}`, { silent });
        
        // If silent failure (returns null), don't update cache or lastFetch
        if (response === null) {
            log(`[Sync] Silent sync failed for ${key}.`);
            return null;
        }

        const data = await response.json().catch(() => null);
        if (data) {
            cache[key] = data;
            lastFetch[key] = Date.now();
            log(`[Sync] Cache updated for ${key}.`);
        }
        return data;
    } catch (error) {
        const warn = window.appConsole?.warn || console.warn;
        warn(`[Sync] Error syncing ${key}:`, error.message);
        return null;
    } finally {
        promises[key] = null;
    }
}

/**
 * Triggers a background sync for all supported endpoints.
 */
export function triggerBackgroundSync() {
    const log = window.appConsole?.log || console.log;
    log("[Sync] Triggering full background sync...");
    
    const endpoints = {
        instances: 'instances',
        machines: 'machines',
        domains: 'domains',
        usage: 'usage'
    };

    for (const [key, endpoint] of Object.entries(endpoints)) {
        // Only start a new sync if one isn't already in flight
        if (!promises[key]) {
            promises[key] = performSync(key, endpoint, true);
        }
    }
}

/**
 * Retrieves synced data for a specific key.
 * If data is fresh, returns it. Otherwise, awaits the in-flight sync or starts a loud one.
 * @param {string} key - The cache key.
 * @param {string} endpoint - The API endpoint to call if cache is stale.
 */
export async function getSyncedData(key, endpoint) {
    const log = window.appConsole?.log || console.log;
    // 1. Check if data is already in cache and fresh
    const now = Date.now();
    if (cache[key] && (now - lastFetch[key] < CACHE_TTL)) {
        log(`[Sync] Returning cached data for ${key}.`);
        return cache[key];
    }

    // 2. Check if a sync is already in flight
    if (promises[key]) {
        log(`[Sync] Awaiting in-flight sync for ${key}...`);
        const result = await promises[key];
        if (result) return result;
    }

    // 3. Fallback: Trigger a LOUD fetch (this will prompt for sign-in if needed)
    log(`[Sync] Cache stale or silent sync failed for ${key}. Triggering loud fetch.`);
    const response = await fetchWithAuth(`${API_BASE_URL}/${endpoint}`, { silent: false });
    const data = await response.json();
    
    // Update cache with the loud fetch result
    if (data) {
        cache[key] = data;
        lastFetch[key] = Date.now();
    }
    
    return data;
}

/**
 * Invalidates a specific cache entry.
 * @param {string} key - The cache key to invalidate.
 */
export function invalidateCache(key) {
    const log = window.appConsole?.log || console.log;
    log(`[Sync] Invalidating cache for ${key}.`);
    cache[key] = null;
    lastFetch[key] = 0;
}
