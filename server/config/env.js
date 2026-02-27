/*
 * ─────────────────────────────────────────────────────────────
 *  ENV CONFIGURATION LOADER
 * ─────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS:
 *    Centralises every environment variable into one object so
 *    the rest of the codebase never calls `process.env` directly.
 *    This makes it easy to validate, document, and swap configs
 *    for testing.
 *
 *  CONNECTED TO:
 *    - .env file at project root (loaded by dotenv)
 *    - Consumed by server/config/db.js, server/config/redis.js,
 *      middleware/auth.js, services/*, and server/index.js
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/booking_engine',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  booking: {
    holdTTL: parseInt(process.env.BOOKING_HOLD_TTL, 10) || 900, // 15 minutes
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL, 10) || 60, // 60 seconds
  },
};
