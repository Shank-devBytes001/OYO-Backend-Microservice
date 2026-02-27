/*
 * ─────────────────────────────────────────────────────────────
 *  DISTRIBUTED LOCK SERVICE  (The Double-Booking Guard)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Prevents two concurrent requests from booking the SAME
 *    last available seat/room. This is the single most critical
 *    piece of the booking engine's data-integrity layer.
 *
 * ═════════════════════════════════════════════════════════════
 *  LOCKING STRATEGY EXPLAINED
 * ═════════════════════════════════════════════════════════════
 *
 *  We use a HYBRID approach combining BOTH strategies:
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  LAYER 1 – PESSIMISTIC LOCK (Redis)                    │
 *  │                                                         │
 *  │  Before touching MongoDB at all, we acquire a Redis     │
 *  │  mutex on the inventory item:                           │
 *  │    Key:  "lock:inventory:<inventoryId>"                 │
 *  │    TTL:  5 seconds (auto-releases if the process dies)  │
 *  │                                                         │
 *  │  Only ONE request at a time can hold this key.          │
 *  │  Others get an immediate "sold out / try again" error.  │
 *  │                                                         │
 *  │  WHY PESSIMISTIC HERE?                                  │
 *  │    For hot inventory (last few seats on a popular       │
 *  │    flight), optimistic retries would cause a thundering │
 *  │    herd of failed-and-retry loops. A mutex serialises   │
 *  │    access so exactly one request proceeds at a time.    │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  LAYER 2 – OPTIMISTIC CHECK (MongoDB atomic update)    │
 *  │                                                         │
 *  │  Inside the lock, we do:                                │
 *  │    findOneAndUpdate(                                    │
 *  │      { _id, availableUnits: { $gte: quantity } },       │
 *  │      { $inc: { availableUnits: -quantity } },           │
 *  │      { new: true }                                      │
 *  │    )                                                    │
 *  │                                                         │
 *  │  The `$gte` condition is the optimistic guard – if      │
 *  │  somehow the count is already 0 (edge case with         │
 *  │  multiple app instances sharing one Redis), the update  │
 *  │  returns null and we reject cleanly.                    │
 *  │                                                         │
 *  │  WHY OPTIMISTIC HERE?                                   │
 *  │    It's the last line of defence. Even if the Redis     │
 *  │    lock fails (network partition, clock skew), MongoDB  │
 *  │    itself will never let availableUnits go negative.    │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  CONNECTED TO:
 *    - server/config/redis.js               → Redis client
 *    - server/models/Inventory.js           → atomic decrement
 *    - server/controllers/bookingController → called during booking
 *    - server/services/bookingService.js    → creates the Booking doc
 * ─────────────────────────────────────────────────────────────
 */

const { redis } = require('../config/redis');
const Inventory = require('../models/Inventory');
const { v4: uuidv4 } = require('uuid');

/* Lock key prefix – one per inventory item */
const LOCK_PREFIX = 'lock:inventory:';

/* How long the Redis lock lives before auto-expiring (seconds) */
const LOCK_TTL = 5;

/*
 * ─── acquireLock ────────────────────────────────────────────
 *  Sets a Redis key ONLY IF it doesn't already exist (NX).
 *  Returns a unique token needed to release the lock later.
 *  Returns null if the lock is already held.
 *
 *  The SET NX EX command is atomic in Redis, so two concurrent
 *  callers can never both succeed.
 * ────────────────────────────────────────────────────────────
 */
async function acquireLock(inventoryId) {
  const lockKey = `${LOCK_PREFIX}${inventoryId}`;
  const lockToken = uuidv4(); // unique per request

  /*
   * SET key value NX EX ttl
   *   NX = Only set if Not eXists
   *   EX = Expire after TTL seconds
   * Returns "OK" on success, null if key already exists.
   */
  const result = await redis.set(lockKey, lockToken, 'EX', LOCK_TTL, 'NX');

  return result === 'OK' ? lockToken : null;
}

/*
 * ─── releaseLock ────────────────────────────────────────────
 *  Releases the lock ONLY if the token matches (prevents one
 *  request from accidentally releasing another's lock).
 *
 *  Uses a Lua script for atomicity: the GET + DEL must happen
 *  in a single Redis command to avoid race conditions.
 * ────────────────────────────────────────────────────────────
 */
async function releaseLock(inventoryId, lockToken) {
  const lockKey = `${LOCK_PREFIX}${inventoryId}`;

  /* Atomic compare-and-delete via Lua */
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(luaScript, 1, lockKey, lockToken);
}

/*
 * ─── acquireAndDecrement ────────────────────────────────────
 *  THE MAIN ENTRY POINT for booking attempts.
 *
 *  Flow:
 *    1. Acquire Redis lock on the inventory item
 *    2. Atomically decrement availableUnits in MongoDB
 *    3. Release Redis lock
 *    4. Return the updated inventory doc (or throw)
 *
 *  @param {string} inventoryId  – Mongo ObjectId of inventory
 *  @param {number} quantity     – How many units to reserve
 *  @returns {Object}            – Updated inventory document
 *  @throws {Error}              – If lock fails or sold out
 * ────────────────────────────────────────────────────────────
 */
async function acquireAndDecrement(inventoryId, quantity = 1) {
  const safeId = String(inventoryId);
  const safeQty = Math.max(1, parseInt(quantity) || 1);

  /* ── Step 1: Pessimistic lock via Redis ─────────────────── */
  const lockToken = await acquireLock(safeId);

  if (!lockToken) {
    const err = new Error(
      'This item is being booked by another user. Please try again in a moment.'
    );
    err.statusCode = 409; // Conflict
    throw err;
  }

  try {
    /* ── Step 2: Optimistic atomic decrement via MongoDB ───── */
    const updated = await Inventory.findOneAndUpdate(
      {
        _id: safeId,
        availableUnits: { $gte: safeQty },
        isActive: true,
      },
      {
        $inc: { availableUnits: -safeQty },
      },
      { new: true } // Return the UPDATED document
    );

    if (!updated) {
      const err = new Error(
        'Insufficient availability – this item is sold out or inactive.'
      );
      err.statusCode = 410; // Gone
      throw err;
    }

    return updated;
  } finally {
    /* ── Step 3: ALWAYS release the lock, even on error ───── */
    await releaseLock(safeId, lockToken);
  }
}

/*
 * ─── restoreUnits ───────────────────────────────────────────
 *  Called when a booking is CANCELLED to return the reserved
 *  units back to the inventory pool.
 *
 *  No lock needed here because $inc is atomic in MongoDB and
 *  incrementing (restoring) can never cause a double-booking.
 * ────────────────────────────────────────────────────────────
 */
async function restoreUnits(inventoryId, quantity = 1) {
  await Inventory.findByIdAndUpdate(String(inventoryId), {
    $inc: { availableUnits: Math.max(1, parseInt(quantity) || 1) },
  });
}

module.exports = {
  acquireLock,
  releaseLock,
  acquireAndDecrement,
  restoreUnits,
};
