/*
 * ─────────────────────────────────────────────────────────────
 *  BOOKING SERVICE  (State Machine + Hold Timer)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Encapsulates all booking business logic:
 *    1. Creating a booking (with inventory lock)
 *    2. Transitioning between states (the state machine)
 *    3. Setting up the 15-minute hold timer in Redis
 *    4. Releasing inventory on cancellation
 *
 *  STATE MACHINE ENFORCEMENT:
 *    Every status change goes through `transition()` which:
 *      a) Checks VALID_TRANSITIONS map
 *      b) Applies side effects (timestamps, inventory restore)
 *      c) Saves atomically
 *    Controllers NEVER set booking.status directly.
 *
 *  CONNECTED TO:
 *    - server/services/lockService.js      → acquireAndDecrement
 *    - server/services/cacheService.js     → invalidate on change
 *    - server/models/Booking.js            → Mongoose model
 *    - server/models/Inventory.js          → price lookup
 *    - server/config/redis.js              → hold timer key
 *    - server/config/env.js                → BOOKING_HOLD_TTL
 *    - server/controllers/bookingController → API layer
 *    - server/jobs/bookingExpiry.js         → auto-cancel consumer
 * ─────────────────────────────────────────────────────────────
 */

const Booking = require('../models/Booking');
const Inventory = require('../models/Inventory');
const lockService = require('./lockService');
const cacheService = require('./cacheService');
const { redis } = require('../config/redis');
const config = require('../config/env');

const { STATES, VALID_TRANSITIONS } = Booking;

/* Redis key prefix for the 15-minute hold timer */
const HOLD_PREFIX = 'booking_hold:';

/*
 * ─── createBooking ──────────────────────────────────────────
 *  The end-to-end flow when a user clicks "Book Now":
 *
 *    1. Fetch inventory to get current price
 *    2. Lock + decrement available units (lockService)
 *    3. Create Booking document with PENDING_PAYMENT status
 *    4. Set Redis hold timer (15 min TTL)
 *    5. Invalidate search cache (availability changed)
 *    6. Return the new booking
 *
 *  @param {string} userId      – Authenticated user's ObjectId
 *  @param {string} inventoryId – Target inventory ObjectId
 *  @param {number} quantity    – Number of units to book
 *  @returns {Object}           – Created booking document
 * ────────────────────────────────────────────────────────────
 */
async function createBooking(userId, inventoryId, quantity = 1) {
  /* 1. Fetch inventory for price snapshot */
  const item = await Inventory.findById(inventoryId);
  if (!item || !item.isActive) {
    const err = new Error('Inventory item not found or inactive');
    err.statusCode = 404;
    throw err;
  }

  /* 2. Lock and decrement – throws if sold out or locked */
  await lockService.acquireAndDecrement(inventoryId, quantity);

  try {
    /* 3. Create booking in PENDING_PAYMENT state */
    const booking = await Booking.create({
      userId,
      inventoryId,
      quantity,
      unitPrice: item.price,
      totalPrice: item.price * quantity,
      status: STATES.PENDING_PAYMENT,
    });

    /*
     * 4. Set a Redis key with TTL = 15 minutes.
     *    When this key expires, a keyspace event fires and
     *    the bookingExpiry job auto-cancels the booking.
     *    The value stored is the inventoryId + quantity so the
     *    expiry handler knows what to restore.
     */
    await redis.set(
      `${HOLD_PREFIX}${booking._id}`,
      JSON.stringify({ inventoryId, quantity }),
      'EX',
      config.booking.holdTTL
    );

    /* 5. Invalidate search cache since availability changed */
    await cacheService.invalidatePattern();

    return booking;
  } catch (err) {
    /* If booking creation fails, restore the decremented units */
    await lockService.restoreUnits(inventoryId, quantity);
    throw err;
  }
}

/*
 * ─── transition ─────────────────────────────────────────────
 *  Moves a booking from one state to another, enforcing the
 *  state machine rules.
 *
 *  Side effects per transition:
 *    → CONFIRMED:  set confirmedAt, remove hold timer
 *    → CANCELLED:  set cancelledAt + reason, restore inventory
 *    → COMPLETED:  no special side effect
 *
 *  @param {string} bookingId  – Booking ObjectId
 *  @param {string} newStatus  – Target state
 *  @param {Object} opts       – { reason } for cancellations
 *  @returns {Object}          – Updated booking document
 * ────────────────────────────────────────────────────────────
 */
async function transition(bookingId, newStatus, opts = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    const err = new Error('Booking not found');
    err.statusCode = 404;
    throw err;
  }

  /* Validate the transition is allowed */
  const allowed = VALID_TRANSITIONS[booking.status] || [];
  if (!allowed.includes(newStatus)) {
    const err = new Error(
      `Invalid transition: ${booking.status} → ${newStatus}. ` +
      `Allowed: [${allowed.join(', ')}]`
    );
    err.statusCode = 400;
    throw err;
  }

  /* Apply state-specific side effects */
  booking.status = newStatus;

  if (newStatus === STATES.CONFIRMED) {
    booking.confirmedAt = new Date();
    /* Remove the hold timer – payment received, no auto-cancel */
    await redis.del(`${HOLD_PREFIX}${bookingId}`);
  }

  if (newStatus === STATES.CANCELLED) {
    booking.cancelledAt = new Date();
    booking.cancellationReason = opts.reason || 'User-initiated cancellation';
    /* Return units to inventory pool */
    await lockService.restoreUnits(booking.inventoryId, booking.quantity);
    /* Remove hold timer if it still exists */
    await redis.del(`${HOLD_PREFIX}${bookingId}`);
    /* Invalidate search cache – availability increased */
    await cacheService.invalidatePattern();
  }

  await booking.save();
  return booking;
}

/*
 * ─── getUserBookings ────────────────────────────────────────
 *  Fetches all bookings for a user with inventory details
 *  populated. Used by the "My Bookings" dashboard.
 * ────────────────────────────────────────────────────────────
 */
async function getUserBookings(userId) {
  return Booking.find({ userId })
    .populate('inventoryId', 'title type category origin destination location')
    .sort({ createdAt: -1 });
}

module.exports = { createBooking, transition, getUserBookings, HOLD_PREFIX };
