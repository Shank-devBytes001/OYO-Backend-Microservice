/*
 * ─────────────────────────────────────────────────────────────
 *  BOOKING EXPIRY JOB  (Auto-Release Pending Holds)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Automatically cancels bookings stuck in PENDING_PAYMENT
 *    status after 15 minutes, releasing their inventory back
 *    to the available pool.
 *
 * ═════════════════════════════════════════════════════════════
 *  TWO MECHANISMS (belt and suspenders)
 * ═════════════════════════════════════════════════════════════
 *
 *  MECHANISM 1: Redis Keyspace Notifications (Real-time)
 *  ─────────────────────────────────────────────────────
 *    When a booking is created, we SET a Redis key:
 *      booking_hold:<bookingId>  with TTL = 15 minutes
 *
 *    When that key expires, Redis emits a keyspace event:
 *      __keyevent@0__:expired → "booking_hold:<bookingId>"
 *
 *    This subscriber catches that event and cancels the booking.
 *
 *    PRO: Near-instant (fires within seconds of expiry)
 *    CON: Redis keyspace events are "best effort" – if the
 *         subscriber was disconnected at the moment of expiry,
 *         the event is lost.
 *
 *  MECHANISM 2: Cron Job Sweep (Safety Net)
 *  ─────────────────────────────────────────
 *    Every 2 minutes, a cron job queries MongoDB for bookings
 *    that are PENDING_PAYMENT and older than 15 minutes.
 *    Any found are cancelled.
 *
 *    PRO: Guaranteed cleanup even if Redis events were missed
 *    CON: Up to 2-minute delay beyond the 15-minute mark
 *
 *  Together, these ensure NO booking stays in PENDING_PAYMENT
 *  indefinitely, even if infrastructure hiccups occur.
 *
 *  CONNECTED TO:
 *    - server/config/redis.js          → redisSub subscriber client
 *    - server/services/bookingService.js → transition()
 *    - server/models/Booking.js         → query for stale bookings
 *    - server/index.js                  → initialised at boot
 * ─────────────────────────────────────────────────────────────
 */

const cron = require('node-cron');
const { redis, redisSub } = require('../config/redis');
const bookingService = require('../services/bookingService');
const Booking = require('../models/Booking');
const config = require('../config/env');

/*
 * ─── setupKeyspaceListener ─────────────────────────────────
 *  Subscribes to Redis expired-key events.
 *
 *  PREREQUISITE:
 *    Redis must have keyspace notifications enabled:
 *      CONFIG SET notify-keyspace-events Ex
 *    (done automatically in setupExpiryJob below)
 *
 *  When a key matching "booking_hold:*" expires, we extract
 *  the bookingId and cancel it.
 * ────────────────────────────────────────────────────────────
 */
function setupKeyspaceListener() {
  /*
   * Enable expired-key events on the Redis server.
   * "Ex" means: E = keyevent events, x = expired events
   * This is idempotent – safe to call multiple times.
   */
  redis.config('SET', 'notify-keyspace-events', 'Ex').catch(() => {
    console.warn('[Expiry] Could not enable keyspace notifications (may need Redis admin access)');
  });

  /* Subscribe to the expired event channel for DB 0 */
  redisSub.subscribe('__keyevent@0__:expired');

  redisSub.on('message', async (channel, expiredKey) => {
    /* Only handle our booking hold keys */
    if (!expiredKey.startsWith(bookingService.HOLD_PREFIX)) return;

    const bookingId = expiredKey.replace(bookingService.HOLD_PREFIX, '');

    console.log(`[Expiry] Redis key expired → auto-cancelling booking ${bookingId}`);

    try {
      await bookingService.transition(bookingId, Booking.STATES.CANCELLED, {
        reason: 'Auto-cancelled: payment not received within 15 minutes',
      });
      console.log(`[Expiry] Booking ${bookingId} cancelled successfully`);
    } catch (err) {
      /* Booking might already be cancelled/confirmed – that's OK */
      console.warn(`[Expiry] Could not cancel ${bookingId}: ${err.message}`);
    }
  });

  console.log('[Expiry] Redis keyspace listener active');
}

/*
 * ─── setupCronSweep ─────────────────────────────────────────
 *  Safety net: every 2 minutes, find and cancel any
 *  PENDING_PAYMENT bookings older than holdTTL.
 *
 *  Cron expression: "* /2 * * * *" = every 2nd minute
 * ────────────────────────────────────────────────────────────
 */
function setupCronSweep() {
  cron.schedule('*/2 * * * *', async () => {
    const cutoff = new Date(Date.now() - config.booking.holdTTL * 1000);

    try {
      const stale = await Booking.find({
        status: Booking.STATES.PENDING_PAYMENT,
        createdAt: { $lt: cutoff },
      });

      if (stale.length === 0) return;

      console.log(`[Cron] Found ${stale.length} expired pending booking(s)`);

      for (const booking of stale) {
        try {
          await bookingService.transition(booking._id, Booking.STATES.CANCELLED, {
            reason: 'Auto-cancelled by cron sweep: payment timeout',
          });
          console.log(`[Cron] Cancelled booking ${booking._id}`);
        } catch (err) {
          console.warn(`[Cron] Could not cancel ${booking._id}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('[Cron] Sweep error:', err.message);
    }
  });

  console.log('[Expiry] Cron sweep scheduled (every 2 minutes)');
}

/*
 * ─── setupExpiryJob ─────────────────────────────────────────
 *  Main entry point – starts both mechanisms.
 *  Called once from server/index.js during boot.
 * ────────────────────────────────────────────────────────────
 */
function setupExpiryJob() {
  setupKeyspaceListener();
  setupCronSweep();
}

module.exports = { setupExpiryJob };
