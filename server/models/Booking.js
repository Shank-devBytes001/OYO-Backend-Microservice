/*
 * ─────────────────────────────────────────────────────────────
 *  BOOKING MODEL  (State Machine)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Records every reservation attempt and enforces a strict
 *    lifecycle via a finite state machine:
 *
 *        ┌──────────────────┐
 *        │ PENDING_PAYMENT  │──── (15 min timeout) ────► CANCELLED
 *        └────────┬─────────┘
 *                 │ payment confirmed
 *                 ▼
 *           ┌───────────┐
 *           │ CONFIRMED │──── user cancels ────► CANCELLED
 *           └─────┬─────┘
 *                 │ travel date passes
 *                 ▼
 *           ┌───────────┐
 *           │ COMPLETED │
 *           └───────────┘
 *
 *  VALID TRANSITIONS (enforced in bookingService.transition):
 *    PENDING_PAYMENT → CONFIRMED
 *    PENDING_PAYMENT → CANCELLED
 *    CONFIRMED       → CANCELLED
 *    CONFIRMED       → COMPLETED
 *
 *  CONNECTED TO:
 *    - server/services/bookingService.js  → state transitions
 *    - server/services/lockService.js     → creates booking after lock
 *    - server/controllers/bookingController.js → API endpoints
 *    - server/jobs/bookingExpiry.js        → auto-cancel expired holds
 *    - server/models/Inventory.js          → inventoryId ref
 *    - server/models/User.js               → userId ref
 *    - server/models/Task.js               → tasks reference bookingId
 *
 *  TTL NOTE:
 *    When a booking enters PENDING_PAYMENT, a Redis key
 *    `booking_hold:<bookingId>` is set with a 15-min TTL.
 *    When that key expires, a keyspace event triggers auto-cancel.
 *    See server/jobs/bookingExpiry.js for the listener.
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');

/* All valid booking states – exported for reuse in validators */
const BOOKING_STATES = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
};

/*
 * Map of allowed transitions.
 * Key = current state, Value = array of states it can move to.
 * Used by bookingService.transition() to reject illegal jumps.
 */
const VALID_TRANSITIONS = {
  [BOOKING_STATES.PENDING_PAYMENT]: [BOOKING_STATES.CONFIRMED, BOOKING_STATES.CANCELLED],
  [BOOKING_STATES.CONFIRMED]: [BOOKING_STATES.CANCELLED, BOOKING_STATES.COMPLETED],
  [BOOKING_STATES.CANCELLED]: [],   // Terminal state
  [BOOKING_STATES.COMPLETED]: [],   // Terminal state
};

const bookingSchema = new mongoose.Schema(
  {
    /* Who made the booking */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /* What was booked */
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },

    /* How many units reserved (e.g. 2 seats, 1 room) */
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    /* Snapshot of unit price at time of booking (prices can change later) */
    unitPrice: {
      type: Number,
      required: true,
    },

    /* Total = quantity × unitPrice (pre-calculated for query convenience) */
    totalPrice: {
      type: Number,
      required: true,
    },

    /*
     * STATE MACHINE FIELD
     * Only changes via bookingService.transition() which checks
     * VALID_TRANSITIONS before applying the update.
     */
    status: {
      type: String,
      enum: Object.values(BOOKING_STATES),
      default: BOOKING_STATES.PENDING_PAYMENT,
      index: true,
    },

    /* Timestamp when payment was confirmed (null while pending) */
    confirmedAt: { type: Date, default: null },

    /* Timestamp when booking was cancelled (null if active) */
    cancelledAt: { type: Date, default: null },

    /* Reason for cancellation (user-initiated vs auto-expired) */
    cancellationReason: { type: String, default: null },
  },
  {
    timestamps: true, // createdAt = booking initiation time
  }
);

/* Index for the expiry cron – finds pending bookings older than 15 min */
bookingSchema.index(
  { status: 1, createdAt: 1 },
  { name: 'pending_expiry' }
);

/* Attach constants to the model for easy import elsewhere */
bookingSchema.statics.STATES = BOOKING_STATES;
bookingSchema.statics.VALID_TRANSITIONS = VALID_TRANSITIONS;

module.exports = mongoose.model('Booking', bookingSchema);
