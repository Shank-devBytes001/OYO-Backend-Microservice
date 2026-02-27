/*
 * ─────────────────────────────────────────────────────────────
 *  MONGODB CONNECTION
 * ─────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS:
 *    Wraps the Mongoose connection lifecycle so the rest of the
 *    app just calls `connectDB()` once at startup.
 *
 *  CONNECTED TO:
 *    - server/config/env.js  → reads MONGODB_URI
 *    - server/index.js       → called during boot sequence
 *    - All Mongoose models    → they rely on this connection
 *
 *  ARCHITECTURE NOTE:
 *    Mongoose maintains a singleton connection pool internally.
 *    We enable `autoIndex: false` in production because building
 *    indexes on large collections blocks the event loop.
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');
const config = require('./env');

async function connectDB() {
  try {
    await mongoose.connect(config.mongo.uri, {
      autoIndex: config.nodeEnv !== 'production',
    });
    console.log(`[MongoDB] Connected → ${config.mongo.uri}`);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
