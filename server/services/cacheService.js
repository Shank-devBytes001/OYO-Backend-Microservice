/*
 * ─────────────────────────────────────────────────────────────
 *  CACHE SERVICE  (Cache-Aside Pattern)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Reduces MongoDB load for read-heavy search queries by
 *    caching results in Redis with a short TTL.
 *
 * ═════════════════════════════════════════════════════════════
 *  CACHE-ASIDE FLOW (also called "Lazy Loading")
 * ═════════════════════════════════════════════════════════════
 *
 *    Client Request
 *         │
 *         ▼
 *    ┌─────────────┐   HIT    ┌─────────┐
 *    │ Check Redis │────────► │ Return  │
 *    └──────┬──────┘          └─────────┘
 *           │ MISS
 *           ▼
 *    ┌─────────────┐
 *    │ Query Mongo │
 *    └──────┬──────┘
 *           │
 *           ▼
 *    ┌──────────────────┐
 *    │ Hydrate Redis    │  (SET key value EX ttl)
 *    │ with results     │
 *    └──────┬───────────┘
 *           │
 *           ▼
 *    ┌─────────┐
 *    │ Return  │
 *    └─────────┘
 *
 *  WHY SHORT TTL?
 *    Inventory availability changes rapidly (bookings, cancels).
 *    A 60-second TTL means search results are at most 1 minute
 *    stale. The actual booking attempt always hits MongoDB with
 *    the distributed lock, so stale cache never causes overbooking.
 *
 *  CACHE KEY STRATEGY:
 *    We hash the full search query params into a deterministic
 *    key so identical searches share the same cache entry:
 *      "search:<sha256 of sorted JSON params>"
 *
 *  CONNECTED TO:
 *    - server/config/redis.js                → Redis client
 *    - server/config/env.js                  → CACHE_TTL setting
 *    - server/services/searchService.js      → provides Mongo results
 *    - server/controllers/searchController.js → calls getOrSet()
 * ─────────────────────────────────────────────────────────────
 */

const { redis } = require('../config/redis');
const config = require('../config/env');
const crypto = require('crypto');

const CACHE_PREFIX = 'search:';

/*
 * ─── buildCacheKey ──────────────────────────────────────────
 *  Creates a deterministic cache key from arbitrary query params.
 *  Sorts keys alphabetically so { a:1, b:2 } and { b:2, a:1 }
 *  produce the same hash.
 * ────────────────────────────────────────────────────────────
 */
function buildCacheKey(params) {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 16);
  return `${CACHE_PREFIX}${hash}`;
}

/*
 * ─── getOrSet  (the core Cache-Aside function) ─────────────
 *  1. Try to GET from Redis
 *  2. If HIT  → parse JSON and return immediately
 *  3. If MISS → call the provided `fetchFn` to get from Mongo,
 *               store the result in Redis, then return it
 *
 *  @param {Object}   params  – The search parameters (used as key)
 *  @param {Function} fetchFn – Async function that queries MongoDB
 *  @returns {Object}         – The search results (from cache or DB)
 * ────────────────────────────────────────────────────────────
 */
async function getOrSet(params, fetchFn) {
  const key = buildCacheKey(params);

  /* Step 1: Check cache */
  const cached = await redis.get(key);

  if (cached) {
    console.log(`[Cache] HIT  → ${key} (served from Redis)`);
    return { data: JSON.parse(cached), fromCache: true };
  }

  console.log(`[Cache] MISS → ${key} (querying MongoDB)`);
  const freshData = await fetchFn();

  redis
    .set(key, JSON.stringify(freshData), 'EX', config.cache.ttl)
    .then(() => console.log(`[Cache] SET  → ${key} (TTL ${config.cache.ttl}s)`))
    .catch((err) => console.error('[Cache] Hydration failed:', err.message));

  return { data: freshData, fromCache: false };
}

/*
 * ─── invalidatePattern ──────────────────────────────────────
 *  Clears all search cache entries. Called after inventory
 *  changes (new item added, booking made, cancellation).
 *
 *  Uses SCAN instead of KEYS to avoid blocking Redis on
 *  large keyspaces.
 * ────────────────────────────────────────────────────────────
 */
async function invalidatePattern(pattern = `${CACHE_PREFIX}*`) {
  const stream = redis.scanStream({ match: pattern, count: 100 });

  stream.on('data', (keys) => {
    if (keys.length) {
      redis.del(...keys).catch(() => {});
    }
  });

  return new Promise((resolve) => stream.on('end', resolve));
}

module.exports = { buildCacheKey, getOrSet, invalidatePattern };
