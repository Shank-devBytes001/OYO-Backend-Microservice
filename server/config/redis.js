/*
 * ─────────────────────────────────────────────────────────────
 *  REDIS CLIENT FACTORY
 * ─────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS:
 *    Creates and exports TWO Redis connections:
 *      1. `redis`      – General-purpose (caching, locking)
 *      2. `redisSub`   – Subscriber client for keyspace events
 *
 *  WHY TWO CLIENTS?
 *    A Redis client in SUBSCRIBE mode cannot execute normal
 *    commands (GET, SET, etc.). So we need a dedicated
 *    subscriber for listening to key-expiration events that
 *    power the booking hold timeout (15-min auto-release).
 *
 *  CONNECTED TO:
 *    - server/config/env.js         → reads REDIS_HOST/PORT/PASSWORD
 *    - server/services/lockService  → uses `redis` for distributed locks
 *    - server/services/cacheService → uses `redis` for cache-aside
 *    - server/jobs/bookingExpiry.js → uses `redisSub` for expiration events
 *    - server/index.js              → health check on startup
 * ─────────────────────────────────────────────────────────────
 */

const Redis = require('ioredis');
const config = require('./env');

const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  /*
   * TLS: Some Redis Cloud instances require TLS, others don't.
   * The free-tier endpoints on redislabs.com typically do NOT use TLS.
   * If your provider requires TLS, set REDIS_TLS=true in .env
   */
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  maxRetriesPerRequest: null,
};

/* Primary client – caching, locks, general commands */
const redis = new Redis(redisOptions);

/* Subscriber client – dedicated to keyspace notification events */
const redisSub = new Redis(redisOptions);

redis.on('connect', () => console.log('[Redis] Primary client connected'));
redis.on('error', (err) => console.error('[Redis] Primary error:', err.message));

redisSub.on('connect', () => console.log('[Redis] Subscriber client connected'));
redisSub.on('error', (err) => console.error('[Redis] Subscriber error:', err.message));

module.exports = { redis, redisSub };
